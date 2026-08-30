import { spawn, type ChildProcessWithoutNullStreams, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { PassThrough, Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as acp from "@agentclientprotocol/sdk";
import { canonicalize, normalizeUpdate, permissionEvent, redact, rpcEvent, snapshotEvent, type FidelityEvent } from "./contract.js";

type AnyRecord = Record<string, any>;
type Direction = "client->agent" | "agent->client" | "stderr";
type WireChunk = { direction: Direction; text: string };
type PermissionMode = "select" | "hold";

type Trace = {
  chunks: WireChunk[];
  capture(direction: Direction, chunk: Uint8Array | string): void;
};

type Terminal = {
  terminalId: string;
  process: ChildProcess;
  output: string;
  exit: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
};

type State = {
  workspace: string;
  sequence: number;
  events: FidelityEvent[];
  clientRpcs: AnyRecord[];
  permissionRequests: AnyRecord[];
  permissionResolutions: AnyRecord[];
  pendingPermission: AnyRecord | null;
  pendingPermissionReject: ((error: Error) => void) | null;
  permissionMode: PermissionMode;
  terminals: Map<string, Terminal>;
  terminalCounter: number;
  mcpCalls: AnyRecord[];
  trace: Trace;
};

type Running = {
  proc: ChildProcessWithoutNullStreams;
  connection: acp.ClientConnection;
  state: State;
};

export type FidelityResult = {
  schemaVersion: 1;
  provider: "fixture";
  mode: "deterministic-official-sdk";
  runtime: Record<string, unknown>;
  tests: Record<string, AnyRecord>;
  events: FidelityEvent[];
  clientRpcs: AnyRecord[];
  mcpCalls: AnyRecord[];
  workspace: AnyRecord;
};

const wait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await wait(10);
  return predicate();
}

function makeTrace(): Trace {
  const chunks: WireChunk[] = [];
  let bytes = 0;
  return {
    chunks,
    capture(direction, chunk) {
      if (bytes >= 350_000) return;
      const text = String(redact(Buffer.from(chunk).toString("utf8")));
      const remaining = 350_000 - bytes;
      bytes += Math.min(remaining, text.length);
      const piece = text.slice(0, remaining);
      const previous = chunks[chunks.length - 1];
      if (previous?.direction === direction) previous.text += piece;
      else chunks.push({ direction, text: piece });
    },
  };
}

function safeEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    HOME: extra.HOME,
    FIXTURE_WORKSPACE: extra.FIXTURE_WORKSPACE,
    FIXTURE_MCP_URL: extra.FIXTURE_MCP_URL,
  };
}

function streamForChild(proc: ChildProcessWithoutNullStreams, trace: Trace): acp.Stream {
  const toAgent = new PassThrough();
  const fromAgent = new PassThrough();
  toAgent.on("data", (chunk) => trace.capture("client->agent", chunk));
  fromAgent.on("data", (chunk) => trace.capture("agent->client", chunk));
  proc.stderr.on("data", (chunk) => trace.capture("stderr", chunk));
  toAgent.pipe(proc.stdin);
  proc.stdout.pipe(fromAgent);
  return acp.ndJsonStream(
    Writable.toWeb(toAgent) as WritableStream<Uint8Array>,
    Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>,
  );
}

function sessionIdOf(params: AnyRecord): string {
  return typeof params.sessionId === "string" ? params.sessionId : "fidelity-session";
}

function safeWorkspacePath(workspace: string, candidate: string): string {
  const path = resolve(candidate);
  if (path !== workspace && !path.startsWith(`${workspace}/`)) throw new Error(`fixture path outside workspace: ${path}`);
  return path;
}

function appendEvent(state: State, event: FidelityEvent): void {
  state.events.push(event);
}

function clientFor(state: State, permissionMode: PermissionMode): acp.ClientApp {
  state.permissionMode = permissionMode;
  const app = acp.client({ name: "hass-conx-permission-fidelity" });
  app.onNotification(acp.methods.client.session.update, (ctx: any) => {
    appendEvent(state, normalizeUpdate(ctx.params as acp.SessionNotification, ++state.sequence));
  });
  app.onRequest(acp.methods.client.session.requestPermission, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const sessionId = sessionIdOf(params);
    const toolCall = params.toolCall ?? {};
    const request = {
      sessionId,
      toolCallId: toolCall.toolCallId ?? null,
      title: toolCall.title ?? null,
      kind: toolCall.kind ?? null,
      options: (params.options ?? []).map((option: AnyRecord) => ({ optionId: option.optionId, kind: option.kind, name: option.name })),
    };
    state.permissionRequests.push(request);
    appendEvent(state, permissionEvent(++state.sequence, sessionId, false, request));
    if (permissionMode === "hold") {
      state.pendingPermission = request;
      return new Promise((resolvePromise, rejectPromise) => {
        state.pendingPermissionReject = rejectPromise;
        void resolvePromise;
      });
    }
    const selected = (params.options ?? []).find((option: AnyRecord) => option.kind === "allow_once") ?? params.options?.[0];
    if (!selected) return { outcome: { outcome: "cancelled" } } as any;
    const resolution = { sessionId, toolCallId: toolCall.toolCallId ?? null, optionId: selected.optionId };
    state.permissionResolutions.push(resolution);
    appendEvent(state, permissionEvent(++state.sequence, sessionId, true, resolution));
    return { outcome: { outcome: "selected", optionId: selected.optionId } } as any;
  });
  app.onRequest(acp.methods.client.fs.readTextFile, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const path = safeWorkspacePath(state.workspace, params.path);
    const content = await readFile(path, "utf8");
    const record = { method: "fs/read_text_file", sessionId: sessionIdOf(params), path, contentLength: content.length };
    state.clientRpcs.push(record);
    appendEvent(state, rpcEvent(++state.sequence, record.sessionId, record.method, { path, contentLength: content.length }));
    return { content };
  });
  app.onRequest(acp.methods.client.fs.writeTextFile, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const path = safeWorkspacePath(state.workspace, params.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, params.content, "utf8");
    const record = { method: "fs/write_text_file", sessionId: sessionIdOf(params), path, contentLength: String(params.content).length };
    state.clientRpcs.push(record);
    appendEvent(state, rpcEvent(++state.sequence, record.sessionId, record.method, { path, contentLength: record.contentLength }));
    return {};
  });
  app.onRequest(acp.methods.client.terminal.create, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const cwd = safeWorkspacePath(state.workspace, params.cwd);
    if (cwd !== state.workspace) throw new Error("fixture only permits the workspace cwd");
    if (params.command !== "/bin/sh") throw new Error("fixture only permits /bin/sh");
    const terminalId = `terminal-${++state.terminalCounter}`;
    const child = spawn(params.command, params.args ?? [], {
      cwd,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: process.env.HOME },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const terminal: Terminal = {
      terminalId,
      process: child,
      output: "",
      exit: new Promise((resolvePromise) => child.once("exit", (code, signal) => resolvePromise({ exitCode: code, signal }))),
    };
    child.stdout.on("data", (chunk) => { terminal.output += Buffer.from(chunk).toString("utf8"); });
    child.stderr.on("data", (chunk) => { terminal.output += Buffer.from(chunk).toString("utf8"); });
    state.terminals.set(terminalId, terminal);
    const sessionId = sessionIdOf(params);
    const record = { method: "terminal/create", sessionId, terminalId, command: params.command, args: params.args ?? [], cwd };
    state.clientRpcs.push(record);
    appendEvent(state, rpcEvent(++state.sequence, sessionId, record.method, { terminalId, command: params.command, args: params.args ?? [] }));
    return { terminalId };
  });
  app.onRequest(acp.methods.client.terminal.waitForExit, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const terminal = state.terminals.get(params.terminalId);
    if (!terminal) throw new Error(`unknown fixture terminal ${params.terminalId}`);
    const exitStatus = await terminal.exit;
    const sessionId = sessionIdOf(params);
    const record = { method: "terminal/wait_for_exit", sessionId, terminalId: params.terminalId, ...exitStatus };
    state.clientRpcs.push(record);
    appendEvent(state, rpcEvent(++state.sequence, sessionId, record.method, { terminalId: params.terminalId, ...exitStatus }));
    return exitStatus;
  });
  app.onRequest(acp.methods.client.terminal.output, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const terminal = state.terminals.get(params.terminalId);
    if (!terminal) throw new Error(`unknown fixture terminal ${params.terminalId}`);
    const exitStatus = await Promise.race([terminal.exit, wait(50).then(() => undefined)]);
    const sessionId = sessionIdOf(params);
    const record = { method: "terminal/output", sessionId, terminalId: params.terminalId, output: terminal.output, truncated: false, exitStatus: exitStatus ?? null };
    state.clientRpcs.push({ ...record, output: undefined });
    appendEvent(state, rpcEvent(++state.sequence, sessionId, record.method, { terminalId: params.terminalId, output: terminal.output, truncated: false, exitStatus: exitStatus ?? null }));
    return { output: terminal.output, truncated: false, ...(exitStatus ? { exitStatus } : {}) };
  });
  app.onRequest(acp.methods.client.terminal.release, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const terminal = state.terminals.get(params.terminalId);
    if (!terminal) throw new Error(`unknown fixture terminal ${params.terminalId}`);
    if (terminal.process.exitCode === null && !terminal.process.killed) terminal.process.kill("SIGTERM");
    const sessionId = sessionIdOf(params);
    const record = { method: "terminal/release", sessionId, terminalId: params.terminalId };
    state.clientRpcs.push(record);
    appendEvent(state, rpcEvent(++state.sequence, sessionId, record.method, { terminalId: params.terminalId }));
    return {};
  });
  app.onRequest(acp.methods.client.terminal.kill, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const terminal = state.terminals.get(params.terminalId);
    if (terminal && terminal.process.exitCode === null && !terminal.process.killed) terminal.process.kill("SIGTERM");
    return {};
  });
  return app;
}

async function startMcpFixture(workspace: string, calls: AnyRecord[]): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let body: AnyRecord = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { /* report a JSON-RPC error below */ }
    const method = body.method ?? "invalid";
    const name = body.params?.name ?? null;
    const args = body.params?.arguments ?? {};
    calls.push({ method, name, arguments: args });
    let result: AnyRecord;
    if (method === "initialize") {
      result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fidelity-mcp", version: "0.1.0" } };
    } else if (method === "tools/call" && name === "read_state") {
      result = { content: [{ type: "text", text: await readFile(join(workspace, "mcp-state.json"), "utf8") }] };
    } else if (method === "tools/call" && name === "write_state") {
      await writeFile(join(workspace, "mcp-state.json"), String(args.content), "utf8");
      result = { content: [{ type: "text", text: "ok" }] };
    } else {
      result = { content: [{ type: "text", text: "unsupported fixture method" }], isError: true };
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, result }));
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture MCP server did not bind a TCP port");
  return { server, url: `http://127.0.0.1:${address.port}/mcp` };
}

async function mcpCall(url: string, id: number, name: string, args: AnyRecord): Promise<AnyRecord> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  return await response.json() as AnyRecord;
}

async function runShell(ctx: any, sessionId: string, label: string, args: string[], command = "/bin/sh"): Promise<void> {
  const terminal: AnyRecord = await ctx.client.request(acp.methods.client.terminal.create, {
    sessionId,
    command,
    args,
    cwd: process.env.FIXTURE_WORKSPACE,
    outputByteLimit: 16_384,
  });
  await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
    sessionUpdate: "tool_call_update", toolCallId: `tool-shell-${label}`, status: "in_progress",
    content: [{ type: "terminal", terminalId: terminal.terminalId }],
  } });
  await ctx.client.request(acp.methods.client.terminal.waitForExit, { sessionId, terminalId: terminal.terminalId });
  await ctx.client.request(acp.methods.client.terminal.output, { sessionId, terminalId: terminal.terminalId });
  await ctx.client.request(acp.methods.client.terminal.release, { sessionId, terminalId: terminal.terminalId });
}

async function launchFixture(workspace: string, mcpUrl: string, permissionMode: PermissionMode): Promise<Running> {
  const script = fileURLToPath(import.meta.url);
  const proc = spawn(process.execPath, ["--import", "tsx", script, "--fixture-agent"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: safeEnvironment({
      HOME: await mkdtemp("/tmp/hass-conx-fidelity-home-"),
      FIXTURE_WORKSPACE: workspace,
      FIXTURE_MCP_URL: mcpUrl,
    }),
  });
  const trace = makeTrace();
  const state: State = {
    workspace,
    sequence: 0,
    events: [],
    clientRpcs: [],
    permissionRequests: [],
    permissionResolutions: [],
    pendingPermission: null,
    pendingPermissionReject: null,
    permissionMode,
    terminals: new Map(),
    terminalCounter: 0,
    mcpCalls: [],
    trace,
  };
  const app = clientFor(state, permissionMode);
  const connection = app.connect(streamForChild(proc, trace));
  return { proc, connection, state };
}

async function stop(running: Running, signal: NodeJS.Signals = "SIGTERM"): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => running.proc.once("exit", (code, childSignal) => resolvePromise({ code, signal: childSignal })));
  running.connection.close();
  running.state.pendingPermissionReject?.(new Error("fixture connection closed with permission pending"));
  if (!running.proc.killed) running.proc.kill(signal);
  return await Promise.race([exit, wait(2000).then(() => ({ code: null, signal }))]);
}

function clientCapabilities(): AnyRecord {
  return {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
    session: { configOptions: {} },
    elicitation: { form: {}, url: {} },
  };
}

async function fixtureAgent(): Promise<void> {
  const workspace = process.env.FIXTURE_WORKSPACE;
  const mcpUrl = process.env.FIXTURE_MCP_URL;
  if (!workspace || !mcpUrl) throw new Error("fixture agent requires FIXTURE_WORKSPACE and FIXTURE_MCP_URL");
  let sessionId = "fidelity-session";
  let cancelled = false;
  let resolveCancellation: (() => void) | null = null;
  const fixture = acp.agent({ name: "hass-conx-permission-fidelity-fixture" });
  fixture.onRequest(acp.methods.agent.initialize, async () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentInfo: { name: "hass-conx-permission-fidelity-fixture", version: "0.1.0" },
    authMethods: [],
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: false, audio: false, embeddedContext: true },
      mcpCapabilities: { http: true, sse: false },
      sessionCapabilities: { resume: {}, list: {} },
    },
  } as any));
  fixture.onRequest(acp.methods.agent.session.new, async () => ({
    sessionId,
    modes: { currentModeId: "agent", availableModes: [{ id: "agent", name: "Agent", description: "Deterministic fidelity fixture" }] },
  } as any));
  fixture.onNotification(acp.methods.agent.session.cancel, async () => {
    cancelled = true;
    resolveCancellation?.();
  });
  fixture.onRequest(acp.methods.agent.session.prompt, async (ctx: any) => {
    const promptText = ctx.params.prompt?.map((block: AnyRecord) => block.text ?? "").join("") ?? "";
    if (promptText === "cancel") {
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "waiting" }, messageId: "cancel-message" } });
      await new Promise<void>((resolvePromise) => {
        resolveCancellation = resolvePromise;
        if (cancelled) resolvePromise();
      });
      return { stopReason: "cancelled" };
    }
    if (promptText === "disconnect-pending-permission") {
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-pending-disconnect", title: "Pending destructive action", kind: "execute", status: "pending", rawInput: { command: "destructive-labelled" } } });
      await ctx.client.request(acp.methods.client.session.requestPermission, {
        sessionId,
        toolCall: { toolCallId: "tool-pending-disconnect", title: "Pending destructive action", kind: "execute", status: "pending" },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      });
      return { stopReason: "end_turn" };
    }

    const directPath = join(workspace, "direct-acp.txt");
    const directBefore = "before-direct\n";
    const directAfter = "after-direct-acp\n";
    await writeFile(directPath, directBefore, "utf8");
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "tool-direct-fs", title: "Direct ACP filesystem edit", kind: "edit", status: "in_progress",
      locations: [{ path: directPath, line: 1 }], rawInput: { path: directPath },
    } });
    await ctx.client.request(acp.methods.client.fs.writeTextFile, { sessionId, path: directPath, content: directAfter });
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "tool-direct-fs", status: "completed",
      locations: [{ path: directPath, line: 1 }], content: [{ type: "diff", path: directPath, oldText: directBefore, newText: directAfter }],
    } });

    const storagePath = join(workspace, ".storage", "core.config_entries");
    const storageBefore = await readFile(storagePath, "utf8");
    const storageAfter = "{\"version\":2,\"fixture\":true}\n";
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "tool-storage-fs", title: "Direct .storage-style edit", kind: "edit", status: "in_progress",
      locations: [{ path: storagePath, line: 1 }], rawInput: { path: storagePath },
    } });
    await ctx.client.request(acp.methods.client.fs.writeTextFile, { sessionId, path: storagePath, content: storageAfter });
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "tool-storage-fs", status: "completed",
      locations: [{ path: storagePath, line: 1 }], content: [{ type: "diff", path: storagePath, oldText: storageBefore, newText: storageAfter }],
    } });

    await runShell(ctx, sessionId, "harmless", ["-c", "printf 'harmless-command\\n'"]);
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "tool-shell-mutator", title: "Destructive-labelled shell command (fixture workspace only)", kind: "execute", status: "pending",
      rawInput: { command: "/bin/sh", args: ["-c", "create/modify/delete fixture files"] },
    } });
    const permission = await ctx.client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: { toolCallId: "tool-shell-mutator", title: "Destructive-labelled shell command (fixture workspace only)", kind: "execute", status: "pending" },
      options: [
        { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
        { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
        { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        { optionId: "reject-always", name: "Always reject", kind: "reject_always" },
      ],
    });
    if (permission?.outcome?.outcome === "selected" && permission.outcome.optionId === "allow-once") {
      const script = "printf 'created-by-shell\\n' > shell-created.txt; printf 'modified-by-shell\\n' > shell-modified.txt; rm -f shell-deleted.txt";
      await runShell(ctx, sessionId, "destructive-mutator", ["-c", script], "/bin/sh");
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
        sessionUpdate: "tool_call_update", toolCallId: "tool-shell-mutator", status: "completed", rawOutput: { exitCode: 0 },
      } });
    }

    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "tool-mcp-read", title: "MCP read", kind: "read", status: "in_progress",
      rawInput: { server: "fixture-mcp", tool: "read_state", arguments: {} },
    } });
    const readResult = await mcpCall(mcpUrl, 1, "read_state", {});
    const readText = readResult.result?.content?.[0]?.text ?? "";
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "tool-mcp-read", status: "completed", rawOutput: { valueLength: String(readText).length },
    } });

    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "tool-mcp-write", title: "MCP reversible write", kind: "edit", status: "in_progress",
      rawInput: { server: "fixture-mcp", tool: "write_state", reversible: true },
    } });
    const original = readText;
    await mcpCall(mcpUrl, 2, "write_state", { content: "temporarily-written-by-mcp\n" });
    await mcpCall(mcpUrl, 3, "write_state", { content: original });
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "tool-mcp-write", status: "completed", rawOutput: { changed: true, restored: true },
    } });
    await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "fixture complete" }, messageId: "result-message" } });
    return { stopReason: "end_turn" };
  });
  const stream = acp.ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  );
  const connection = fixture.connect(stream);
  await connection.closed;
}

async function snapshot(workspace: string, names: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const name of names) {
    try { result[name] = await readFile(join(workspace, name), "utf8"); } catch { result[name] = null; }
  }
  return result;
}

async function runFixture(out?: string): Promise<FidelityResult> {
  const workspace = await mkdtemp("/tmp/hass-conx-permission-fidelity-workspace-");
  await mkdir(join(workspace, ".storage"), { recursive: true });
  await writeFile(join(workspace, ".storage", "core.config_entries"), "{\"version\":1}\n", "utf8");
  await writeFile(join(workspace, "shell-modified.txt"), "before-shell\n", "utf8");
  await writeFile(join(workspace, "shell-deleted.txt"), "delete-me\n", "utf8");
  await writeFile(join(workspace, "mcp-state.json"), "seed\n", "utf8");
  const names = ["direct-acp.txt", ".storage/core.config_entries", "shell-created.txt", "shell-modified.txt", "shell-deleted.txt", "mcp-state.json"];
  const before = await snapshot(workspace, names);
  const mcpCalls: AnyRecord[] = [];
  const mcp = await startMcpFixture(workspace, mcpCalls);
  let normal: Running | undefined;
  let pending: Running | undefined;
  const tests: Record<string, AnyRecord> = {};
  const allEvents: FidelityEvent[] = [];
  const allRpcs: AnyRecord[] = [];
  const allTrace: WireChunk[] = [];
  try {
    normal = await launchFixture(workspace, mcp.url, "select");
    const init: AnyRecord = await (normal.connection.agent as any).request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: clientCapabilities(),
      clientInfo: { name: "hass-conx-permission-fidelity-client", version: "0.1.0" },
    });
    tests.initialize = { status: init.protocolVersion === acp.PROTOCOL_VERSION ? "passed" : "failed", protocolVersion: init.protocolVersion, agentCapabilities: init.agentCapabilities };
    const session: AnyRecord = await (normal.connection.agent as any).request(acp.methods.agent.session.new, { cwd: workspace, mcpServers: [{ type: "http", name: "fixture-mcp", url: mcp.url, headers: [] }] });
    tests.sessionNew = { status: session.sessionId === "fidelity-session" ? "passed" : "failed", sessionId: session.sessionId };
    const response: AnyRecord = await (normal.connection.agent as any).request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: "exercise-fidelity" }] });
    const after = await snapshot(workspace, names);
    const shellChanges = ["shell-created.txt", "shell-modified.txt", "shell-deleted.txt"].filter((name) => before[name] !== after[name]);
    const directWrites = normal.state.clientRpcs.filter((rpc) => rpc.method === "fs/write_text_file").map((rpc) => rpc.path);
    tests.directAcpFilesystemEdit = { status: directWrites.some((path) => path.endsWith("direct-acp.txt")) && after["direct-acp.txt"] === "after-direct-acp\n" ? "passed" : "failed", rpcPaths: directWrites };
    tests.directStorageEdit = { status: directWrites.some((path) => path.endsWith(".storage/core.config_entries")) && after[".storage/core.config_entries"] === "{\"version\":2,\"fixture\":true}\n" ? "passed" : "failed", rpcPaths: directWrites.filter((path) => path.includes(".storage")) };
    tests.shellCommands = { status: normal.state.clientRpcs.some((rpc) => rpc.method === "terminal/create") && shellChanges.length === 3 ? "passed" : "failed", changedBySnapshot: shellChanges, terminalCreates: normal.state.clientRpcs.filter((rpc) => rpc.method === "terminal/create").map((rpc) => ({ title: rpc.terminalId, command: rpc.command, args: rpc.args })) };
    tests.permission = { status: normal.state.permissionRequests.length === 1 && normal.state.permissionResolutions[0]?.optionId === "allow-once" ? "passed" : "failed", requests: normal.state.permissionRequests, resolutions: normal.state.permissionResolutions };
    tests.mcp = { status: mcpCalls.filter((call) => call.name === "read_state").length === 1 && mcpCalls.filter((call) => call.name === "write_state").length === 2 && after["mcp-state.json"] === before["mcp-state.json"] ? "passed" : "failed", calls: mcpCalls };
    tests.diffsAndLocations = { status: normal.state.events.some((event) => Array.isArray(event.data.contentTypes) && (event.data.contentTypes as unknown[]).includes("diff")) && normal.state.events.some((event) => Array.isArray(event.data.locations) && (event.data.locations as any[]).some((location) => String(location.path).endsWith("direct-acp.txt"))) ? "passed" : "failed" };
    tests.terminalOutput = { status: normal.state.events.some((event) => event.kind === "terminal.output" && String(event.data.output).includes("harmless-command")) ? "passed" : "failed" };
    tests.prompt = { status: response.stopReason === "end_turn" ? "passed" : "failed", stopReason: response.stopReason };
    const cancelPrompt: Promise<AnyRecord> = (normal.connection.agent as any).request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: "cancel" }] });
    await waitFor(() => normal!.state.events.some((event) => event.data.text === "waiting"));
    await (normal.connection.agent as any).notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
    const cancelled = await cancelPrompt;
    tests.cancellation = { status: cancelled.stopReason === "cancelled" ? "passed" : "failed", stopReason: cancelled.stopReason, wireMethod: "session/cancel" };
    allEvents.push(...normal.state.events);
    allRpcs.push(...normal.state.clientRpcs);
    allTrace.push(...normal.state.trace.chunks);

    pending = await launchFixture(workspace, mcp.url, "hold");
    await (pending.connection.agent as any).request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: clientCapabilities(), clientInfo: { name: "hass-conx-permission-fidelity-client", version: "0.1.0" } });
    await (pending.connection.agent as any).request(acp.methods.agent.session.new, { cwd: workspace, mcpServers: [] });
    const pendingPrompt = (pending.connection.agent as any).request(acp.methods.agent.session.prompt, { sessionId: "fidelity-session", prompt: [{ type: "text", text: "disconnect-pending-permission" }] }).catch((error: unknown) => String(error));
    const observed = await waitFor(() => pending!.state.pendingPermission !== null);
    const pendingBeforeClose = pending.state.pendingPermission;
    const pendingExit = await stop(pending, "SIGTERM");
    await pendingPrompt;
    tests.disconnectPendingPermission = { status: observed && pending.state.permissionResolutions.length === 0 && pendingExit.signal === "SIGTERM" ? "passed" : "failed", pending: pendingBeforeClose, resolutionCount: pending.state.permissionResolutions.length, processExit: pendingExit, rule: "close/reap without auto-approval" };
    allEvents.push(...pending.state.events);
    allRpcs.push(...pending.state.clientRpcs);
    allTrace.push(...pending.state.trace.chunks);
  } catch (error) {
    tests.error = { status: "failed", error: redact(String(error)) };
  } finally {
    if (normal && !normal.proc.killed) await stop(normal);
    if (pending && !pending.proc.killed) await stop(pending);
    await new Promise<void>((resolvePromise) => mcp.server.close(() => resolvePromise()));
  }
  const after = await snapshot(workspace, names);
  const mergedEvents = allEvents.map((event, index) => ({ ...event, sequence: index + 1 }));
  const result: FidelityResult = {
    schemaVersion: 1,
    provider: "fixture",
    mode: "deterministic-official-sdk",
    runtime: { node: process.version, platform: process.platform, arch: process.arch, sdk: "@agentclientprotocol/sdk@1.4.0" },
    tests: canonicalize(tests, workspace) as Record<string, AnyRecord>,
    events: canonicalize(mergedEvents, workspace) as FidelityEvent[],
    clientRpcs: canonicalize(allRpcs, workspace) as AnyRecord[],
    mcpCalls: canonicalize(mcpCalls, workspace) as AnyRecord[],
    workspace: { before: canonicalize(before, workspace), after: canonicalize(after, workspace), snapshotEvents: canonicalize(names.filter((name) => before[name] !== after[name]).map((name) => snapshotEvent(0, "fidelity-session", { path: join(workspace, name), before: before[name], after: after[name] })), workspace) },
  };
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  await rm(workspace, { recursive: true, force: true });
  return result;
}

function parseArgs(): { fixture: boolean; out?: string } {
  const args = process.argv.slice(2);
  return { fixture: args.includes("--fixture"), out: args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined };
}

async function main(): Promise<void> {
  if (process.argv.includes("--fixture-agent")) {
    await fixtureAgent();
    return;
  }
  const args = parseArgs();
  if (!args.fixture) throw new Error("Usage: npm run fixture -- [--out fixtures/fidelity-run.json]");
  const result = await runFixture(args.out);
  console.log(JSON.stringify({ tests: result.tests, eventKinds: [...new Set(result.events.map((event) => event.kind))] }, null, 2));
}

export { runFixture };

if (process.argv.includes("--fixture") || process.argv.includes("--fixture-agent")) {
  main().catch((error) => {
    console.error(String(redact(error)));
    process.exitCode = 1;
  });
}
