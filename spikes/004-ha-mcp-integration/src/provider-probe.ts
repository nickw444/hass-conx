import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import { redact, startBroker, startUpstream, type HarnessTrace, type ProviderMcpServer } from "./broker.js";

type Provider = "codex" | "cursor";
type AnyRecord = Record<string, any>;

function safeEnvironment(home: string, codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, CODEX_HOME: codexHome, NO_BROWSER: "1" };
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "CURSOR_API_KEY", "CURSOR_AUTH_TOKEN", "SUPERVISOR_TOKEN", "HA_MCP_URL", "ANTHROPIC_API_KEY"]) delete env[key];
  return env;
}

class WireTrace {
  chunks: Array<{ direction: string; text: string }> = [];
  capture(direction: string, chunk: Uint8Array | string): void {
    if (this.chunks.reduce((size, item) => size + item.text.length, 0) > 200_000) return;
    this.chunks.push({ direction, text: String(redact(Buffer.from(chunk).toString("utf8"))) });
  }
}

function streamForChild(proc: ChildProcessWithoutNullStreams, trace: WireTrace): acp.Stream {
  const toAgent = new PassThrough();
  const fromAgent = new PassThrough();
  toAgent.on("data", (chunk) => trace.capture("client->agent", chunk));
  fromAgent.on("data", (chunk) => trace.capture("agent->client", chunk));
  proc.stderr.on("data", (chunk) => trace.capture("stderr", chunk));
  toAgent.pipe(proc.stdin);
  proc.stdout.pipe(fromAgent);
  return acp.ndJsonStream(Writable.toWeb(toAgent) as WritableStream<Uint8Array>, Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>);
}

function clientCapabilities(): AnyRecord {
  return { fs: { readTextFile: true, writeTextFile: true }, terminal: true, session: { configOptions: {} }, plan: {}, elicitation: { form: {}, url: {} } };
}

function providerConfig(config: ProviderMcpServer[]): AnyRecord[] {
  return config.map((entry) => ({ type: entry.type, name: entry.name, url: entry.url, headers: entry.headers }));
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("ACP request timeout")), ms))]);
}

async function stop(proc: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => proc.once("exit", (code, signal) => resolvePromise({ code, signal })));
  if (!proc.killed) proc.kill("SIGTERM");
  return Promise.race([exit, new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => setTimeout(() => resolvePromise({ code: null, signal: "SIGTERM" }), 2_000))]);
}

async function oneProvider(provider: Provider, config: ProviderMcpServer[], trace: HarnessTrace): Promise<Record<string, unknown>> {
  const runtime = mkdtempSync(`/tmp/hass-conx-spike-004-${provider}-`);
  const home = join(runtime, "home");
  const codexHome = join(runtime, "codex");
  await mkdir(home, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const spikeRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const command = provider === "codex" ? join(spikeRoot, "node_modules/@agentclientprotocol/codex-acp/dist/index.js") : (process.env.CURSOR_ACP_COMMAND || "/Users/nickw/.local/bin/agent");
  const args = provider === "codex" ? [] : ["acp"];
  const wire = new WireTrace();
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: safeEnvironment(home, codexHome) });
  const app = acp.client({ name: "hass-conx-spike-004" });
  const connection = app.connect(streamForChild(proc, wire));
  const tests: Record<string, unknown> = {};
  try {
    const agent: any = connection.agent;
    const initialized: AnyRecord = await timeout(agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: clientCapabilities(),
      clientInfo: { name: "hass-conx-spike-004", version: "0.1.0" },
    }), 15_000);
    tests.initialize = { status: "passed", protocolVersion: initialized.protocolVersion, agentInfo: redact(initialized.agentInfo), agentCapabilities: redact(initialized.agentCapabilities) };
    tests.authStatus = { status: "observed", authMethods: redact(initialized.authMethods ?? []) };
    try {
      const session: AnyRecord = await timeout(agent.request(acp.methods.agent.session.new, { cwd: spikeRoot, mcpServers: providerConfig(config) }), 20_000);
      tests.sessionNew = { status: "passed", sessionId: session.sessionId, modes: redact(session.modes), configOptions: redact(session.configOptions) };
      tests.mcpInjection = { status: "accepted", serverNames: config.map((entry) => entry.name), transport: "http", note: "Provider accepted standard ACP session/new MCP shape; MCP endpoint is the local broker." };
    } catch (error) {
      tests.sessionNew = { status: "blocked-or-failed", error: redact(String(error)) };
      tests.mcpInjection = { status: "inconclusive", reason: "session/new failed before provider MCP acceptance could be distinguished", error: redact(String(error)) };
    }
  } catch (error) {
    tests.initialize = { status: "failed", error: redact(String(error)) };
    tests.authStatus = { status: "blocked", reason: "initialize did not return an auth surface" };
  } finally {
    connection.close();
  }
  const processExit = await stop(proc);
  trace.add({ component: "broker", event: "provider_probe", forwarded: true });
  return {
    schemaVersion: 1,
    provider,
    mode: "real-provider",
    command,
    args,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, providerBinaryPresent: existsSync(command), isolatedHome: true, processExit },
    providerMcpServers: redact(config),
    tests,
  };
}

export async function runProviders(outDirectory = "fixtures"): Promise<Record<string, unknown>> {
  const trace: HarnessTrace = { entries: [], add: (entry) => trace.entries.push(entry) };
  const upstream = await startUpstream(trace);
  const broker = await startBroker(trace, upstream.url);
  try {
    const config = broker.providerMcpServers();
    const providers: Record<string, unknown> = {};
    for (const provider of ["codex", "cursor"] as const) {
      const result = await oneProvider(provider, config, trace);
      providers[provider] = result;
      const file = resolve(outDirectory, `${provider}-run.json`);
      await mkdir(resolve(outDirectory), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
    }
    const result = { runtime: { node: process.version, platform: process.platform, arch: process.arch, acpSdk: "@agentclientprotocol/sdk@1.4.0" }, providerMcpServers: redact(config), providers, trace: redact(trace.entries), manualAuthenticationRequired: true };
    await writeFile(resolve(outDirectory, "providers-run.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
    return result;
  } finally {
    await broker.close().catch(() => undefined);
    await upstream.close().catch(() => undefined);
  }
}
