import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";

export const SERVER_NAMES = ["homeassistant-assist", "homeassistant-advanced"] as const;
export const LOCAL_SESSION_CAPABILITY = "local-session-capability";
const UPSTREAM_SYNTHETIC_TOKEN = "synthetic-upstream-token";

export type TraceEntry = {
  component: "upstream" | "broker";
  event: string;
  method?: string;
  path?: string;
  status?: number;
  authorization?: "absent" | "present";
  authValid?: boolean;
  upstreamAuthInjected?: boolean;
  forwarded?: boolean;
  errorClass?: string;
};

export type ProviderMcpServer = {
  type: "http";
  name: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
};

export type HarnessTrace = {
  entries: TraceEntry[];
  add(entry: TraceEntry): void;
};

export function makeTrace(): HarnessTrace {
  const entries: TraceEntry[] = [];
  return { entries, add: (entry) => entries.push(entry) };
}

function pathOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return "[invalid-url]";
  }
}

function authStatus(value: string | string[] | undefined): "absent" | "present" {
  return value ? "present" : "absent";
}

function unauthorized(res: ServerResponse, trace: HarnessTrace, component: "upstream" | "broker", req: IncomingMessage, auth: "absent" | "present"): void {
  trace.add({ component, event: "unauthorized", method: req.method, path: pathOf(req.url), status: 401, authorization: auth, authValid: false });
  res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function safeErrorClass(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server did not expose a TCP address");
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function mcpTransport(): NodeStreamableHTTPServerTransport {
  // Stateless JSON responses keep this harness deterministic while still using
  // the official Streamable HTTP server transport (POST initialize/tools/list).
  return new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
}

export type UpstreamMock = {
  url: string;
  port: number;
  state: { enabled: boolean };
  close(): Promise<void>;
};

export async function startUpstream(trace: HarnessTrace, port = 0): Promise<UpstreamMock> {
  const state = { enabled: false };
  const mcp = new McpServer({ name: "ha-mock-upstream", version: "0.1.0" });
  const stateOutput = z.object({ enabled: z.boolean() });

  mcp.registerTool(
    "ha_read_test_state",
    {
      title: "Read spike test state",
      description: "Read the disposable boolean used by the integration spike.",
      inputSchema: z.object({}),
      outputSchema: stateOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(state) }], structuredContent: { ...state } }),
  );
  mcp.registerTool(
    "ha_set_test_state",
    {
      title: "Set spike test state",
      description: "Set the disposable boolean used by the integration spike; call with false to restore it.",
      inputSchema: z.object({ enabled: z.boolean() }),
      outputSchema: stateOutput,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ enabled }) => {
      state.enabled = enabled;
      return { content: [{ type: "text", text: JSON.stringify(state) }], structuredContent: { ...state } };
    },
  );

  const transport = mcpTransport();
  await mcp.connect(transport);
  const server = createServer((req, res) => {
    const authorization = req.headers.authorization;
    const status = authStatus(authorization);
    trace.add({ component: "upstream", event: "request", method: req.method, path: pathOf(req.url), authorization: status });
    if (authorization !== `Bearer ${UPSTREAM_SYNTHETIC_TOKEN}`) {
      unauthorized(res, trace, "upstream", req, status);
      return;
    }
    trace.add({ component: "upstream", event: "accepted", method: req.method, path: pathOf(req.url), status: 200, authorization: "present", authValid: true, forwarded: true });
    void transport.handleRequest(req, res).catch((error: unknown) => {
      trace.add({ component: "upstream", event: "transport_error", method: req.method, path: pathOf(req.url), errorClass: safeErrorClass(error) });
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_transport_error" }));
    });
  });
  const actualPort = await listen(server, port);
  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}/mcp`,
    state,
    async close() {
      await closeServer(server);
      await mcp.close();
    },
  };
}

async function withUpstreamClient<T>(trace: HarnessTrace, upstreamUrl: string, action: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "hass-conx-spike-broker", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(upstreamUrl), {
    authProvider: { token: async () => UPSTREAM_SYNTHETIC_TOKEN },
    onInsufficientScope: "throw",
  });
  trace.add({ component: "broker", event: "upstream_client", upstreamAuthInjected: true, forwarded: true });
  try {
    await client.connect(transport);
    return await action(client);
  } catch (error) {
    trace.add({ component: "broker", event: "upstream_error", errorClass: safeErrorClass(error), upstreamAuthInjected: true });
    throw error;
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function upstreamCall(trace: HarnessTrace, upstreamUrl: string, name: string, args: Record<string, unknown> = {}): Promise<any> {
  return withUpstreamClient(trace, upstreamUrl, (client) => client.callTool({ name, arguments: args }));
}

async function upstreamTools(trace: HarnessTrace, upstreamUrl: string): Promise<string[]> {
  const result = await withUpstreamClient(trace, upstreamUrl, (client) => client.listTools());
  return result.tools.map((tool) => tool.name);
}

export type Broker = {
  baseUrl: string;
  providerMcpServers(): ProviderMcpServer[];
  close(): Promise<void>;
  health(): Promise<{ status: "ok" | "degraded"; upstreamTools?: string[]; errorClass?: string }>;
};

export async function startBroker(trace: HarnessTrace, upstreamUrl: string, port = 0): Promise<Broker> {
  const endpoints = new Map<string, { mcp: McpServer; transport: NodeStreamableHTTPServerTransport }>();
  const stateOutput = z.object({ enabled: z.boolean() });
  for (const name of SERVER_NAMES) {
    const mcp = new McpServer({ name, version: "0.1.0" });
    mcp.registerTool(
      "ha_read_test_state",
      { title: "Read test state", description: "Read the broker-owned disposable test state.", inputSchema: z.object({}), outputSchema: stateOutput, annotations: { readOnlyHint: true, idempotentHint: true } },
      async () => upstreamCall(trace, upstreamUrl, "ha_read_test_state"),
    );
    mcp.registerTool(
      "ha_set_test_state",
      { title: "Set test state", description: "Set the broker-owned disposable test state; restore false after testing.", inputSchema: z.object({ enabled: z.boolean() }), outputSchema: stateOutput, annotations: { destructiveHint: false, idempotentHint: true } },
      async ({ enabled }) => upstreamCall(trace, upstreamUrl, "ha_set_test_state", { enabled }),
    );
    const transport = mcpTransport();
    await mcp.connect(transport);
    endpoints.set(name, { mcp, transport });
  }

  const server = createServer((req, res) => {
    const endpoint = pathOf(req.url).replace(/^\//, "");
    const selected = endpoints.get(endpoint);
    const authorization = req.headers.authorization;
    const status = authStatus(authorization);
    trace.add({ component: "broker", event: "request", method: req.method, path: pathOf(req.url), authorization: status });
    if (authorization !== `Bearer ${LOCAL_SESSION_CAPABILITY}`) {
      unauthorized(res, trace, "broker", req, status);
      return;
    }
    if (!selected) {
      trace.add({ component: "broker", event: "not_found", method: req.method, path: pathOf(req.url), status: 404, authorization: status });
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    trace.add({ component: "broker", event: "accepted", method: req.method, path: pathOf(req.url), status: 200, authorization: "present", authValid: true, forwarded: true });
    void selected.transport.handleRequest(req, res).catch((error: unknown) => {
      trace.add({ component: "broker", event: "transport_error", method: req.method, path: pathOf(req.url), errorClass: safeErrorClass(error) });
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "broker_transport_error" }));
    });
  });
  const actualPort = await listen(server, port);
  const baseUrl = `http://127.0.0.1:${actualPort}`;
  return {
    baseUrl,
    providerMcpServers() {
      return SERVER_NAMES.map((name) => ({
        type: "http" as const,
        name,
        url: `${baseUrl}/${name}`,
        headers: [{ name: "Authorization", value: `Bearer ${LOCAL_SESSION_CAPABILITY}` }],
      }));
    },
    async health() {
      try {
        const tools = await upstreamTools(trace, upstreamUrl);
        return { status: "ok", upstreamTools: tools };
      } catch (error) {
        return { status: "degraded", errorClass: safeErrorClass(error) };
      }
    },
    async close() {
      await closeServer(server);
      for (const { mcp } of endpoints.values()) await mcp.close();
    },
  };
}

export async function brokerCall(trace: HarnessTrace, broker: Broker, serverName: string, tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const configured = broker.providerMcpServers().find((entry) => entry.name === serverName);
  if (!configured) throw new Error(`Unknown broker endpoint ${serverName}`);
  const client = new Client({ name: "hass-conx-spike-test-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(configured.url), {
    authProvider: { token: async () => LOCAL_SESSION_CAPABILITY },
    onInsufficientScope: "throw",
  });
  try {
    await client.connect(transport);
    return await client.callTool({ name: tool, arguments: args });
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function brokerListTools(trace: HarnessTrace, broker: Broker, serverName: string): Promise<string[]> {
  const configured = broker.providerMcpServers().find((entry) => entry.name === serverName);
  if (!configured) throw new Error(`Unknown broker endpoint ${serverName}`);
  const client = new Client({ name: "hass-conx-spike-test-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(configured.url), {
    authProvider: { token: async () => LOCAL_SESSION_CAPABILITY },
    onInsufficientScope: "throw",
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((tool) => tool.name);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll(UPSTREAM_SYNTHETIC_TOKEN, "[REDACTED]")
      .replaceAll(LOCAL_SESSION_CAPABILITY, "[REDACTED]")
      .replace(/(https?:\/\/[^\s?]+)(\?[^\s]+)/g, "$1?[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /authorization|token|secret|password/i.test(key) && child !== "present" && child !== "absent" ? "[REDACTED]" : redact(child)]));
  return value;
}

export function providerConfigContainsOnlyLocalCapability(config: ProviderMcpServer[]): boolean {
  const serialized = JSON.stringify(config);
  return serialized.includes(LOCAL_SESSION_CAPABILITY) && !serialized.includes(UPSTREAM_SYNTHETIC_TOKEN) && config.every((server) => server.name === "homeassistant-assist" || server.name === "homeassistant-advanced");
}

export { UPSTREAM_SYNTHETIC_TOKEN };
