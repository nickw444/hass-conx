import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import * as acp from "@agentclientprotocol/sdk";
import { deriveFileChange, normalizePermission, normalizeSessionUpdate, normalizeTerminal, normalizeTurnState, redact, type NormalizedEvent } from "./contract.js";

type AnyRecord = Record<string, any>;
type WireChunk = { direction: "client->agent" | "agent->client" | "stderr"; text: string };

type ProbeResult = {
  schemaVersion: 1;
  provider: string;
  mode: "real-provider" | "fixture";
  command: string;
  args: string[];
  runtime: Record<string, unknown>;
  tests: Record<string, AnyRecord>;
  normalizedEvents: NormalizedEvent[];
};

class Trace {
  chunks: WireChunk[] = [];
  private bytes = 0;
  capture(direction: WireChunk["direction"], chunk: Uint8Array | string): void {
    if (this.bytes >= 300_000) return;
    const text = Buffer.from(chunk).toString("utf8");
    const remaining = 300_000 - this.bytes;
    this.bytes += Math.min(remaining, text.length);
    this.chunks.push({ direction, text: String(redact(text)).slice(0, remaining) });
  }
}

type Running = {
  proc: ChildProcessWithoutNullStreams;
  connection: acp.ClientConnection;
  trace: Trace;
  stderr: string[];
  events: NormalizedEvent[];
  sequence: number;
  permissionRequests: AnyRecord[];
  permissionResolutions: AnyRecord[];
  terminalRequests: AnyRecord[];
  fileRequests: AnyRecord[];
  elicitationRequests: AnyRecord[];
};

const wait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

function safeEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    HOME: extra.HOME,
    CODEX_HOME: extra.CODEX_HOME,
    ...extra,
  };
  // Never forward credentials from the invoking shell into this diagnostic.
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "CURSOR_API_KEY", "CURSOR_AUTH_TOKEN", "SUPERVISOR_TOKEN", "HA_MCP_URL", "ANTHROPIC_API_KEY"]) delete env[key];
  return env;
}

function streamForChild(proc: ChildProcessWithoutNullStreams, trace: Trace): acp.Stream {
  const toAgent = new PassThrough();
  const fromAgent = new PassThrough();
  toAgent.on("data", (chunk) => trace.capture("client->agent", chunk));
  fromAgent.on("data", (chunk) => trace.capture("agent->client", chunk));
  // The pass-through is the stream presented to the SDK, while the provider
  // process sees the other side of the pipe.
  toAgent.pipe(proc.stdin);
  proc.stdout.pipe(fromAgent);
  proc.stderr.on("data", (chunk) => {
    const text = String(redact(Buffer.from(chunk).toString("utf8")));
    trace.capture("stderr", text);
  });
  return acp.ndJsonStream(Writable.toWeb(toAgent) as WritableStream<Uint8Array>, Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>);
}

/**
 * Build the single client adapter used for both real providers and the fixture.
 * Provider-specific launch/auth logic is deliberately outside this adapter.
 */
function clientFor(trace: Trace, state: Omit<Running, "proc" | "connection" | "trace" | "stderr">): acp.ClientApp {
  const app = acp.client({ name: "hass-conx-acp-parity-spike", });
  app.onNotification(acp.methods.client.session.update, (ctx: any) => {
    const notification = ctx.params as acp.SessionNotification;
    const sequence = ++state.sequence;
    state.events.push(normalizeSessionUpdate(notification, sequence));
    const file = deriveFileChange(notification, ++state.sequence);
    if (file) state.events.push(file);
  });
  app.onRequest(acp.methods.client.session.requestPermission, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    const request = { sessionId: params.sessionId, toolCallId: params.toolCall?.toolCallId ?? null, optionIds: (params.options ?? []).map((o: AnyRecord) => o.optionId) };
    state.permissionRequests.push(redact(request) as AnyRecord);
    state.events.push(normalizePermission(params.sessionId, ++state.sequence, true, request));
    const chosen = (params.options ?? []).find((option: AnyRecord) => option.kind === "allow_once") ?? params.options?.[0];
    if (!chosen) return { outcome: "cancelled" } as any;
    const resolution = { sessionId: params.sessionId, toolCallId: params.toolCall?.toolCallId ?? null, optionId: chosen.optionId };
    state.permissionResolutions.push(redact(resolution) as AnyRecord);
    state.events.push(normalizePermission(params.sessionId, ++state.sequence, false, resolution));
    return { outcome: "selected", optionId: chosen.optionId } as any;
  });
  app.onRequest(acp.methods.client.fs.readTextFile, async (ctx: any) => {
    state.fileRequests.push({ method: "fs/read_text_file", path: ctx.params.path });
    return { content: "fixture file content\n" };
  });
  app.onRequest(acp.methods.client.fs.writeTextFile, async (ctx: any) => {
    state.fileRequests.push({ method: "fs/write_text_file", path: ctx.params.path });
    return {};
  });
  app.onRequest(acp.methods.client.terminal.create, async (ctx: any) => {
    state.terminalRequests.push({ method: "terminal/create", command: ctx.params.command, args: ctx.params.args ?? [] });
    state.events.push(normalizeTerminal(ctx.params.sessionId, ++state.sequence, "started", { terminalId: "fixture-terminal", command: ctx.params.command }));
    return { terminalId: "fixture-terminal" };
  });
  app.onRequest(acp.methods.client.terminal.output, async (ctx: any) => {
    state.terminalRequests.push({ method: "terminal/output", terminalId: ctx.params.terminalId });
    state.events.push(normalizeTerminal(ctx.params.sessionId, ++state.sequence, "output", { terminalId: ctx.params.terminalId, output: "fixture terminal output\n", truncated: false }));
    return { output: "fixture terminal output\n", truncated: false, exitStatus: { exitCode: 0 } };
  });
  app.onRequest(acp.methods.client.terminal.waitForExit, async (ctx: any) => {
    state.terminalRequests.push({ method: "terminal/wait_for_exit", terminalId: ctx.params.terminalId });
    return { exitCode: 0 };
  });
  app.onRequest(acp.methods.client.terminal.release, async (ctx: any) => {
    state.terminalRequests.push({ method: "terminal/release", terminalId: ctx.params.terminalId });
    state.events.push(normalizeTerminal(ctx.params.sessionId, ++state.sequence, "completed", { terminalId: ctx.params.terminalId, exitCode: 0 }));
    return {};
  });
  app.onRequest(acp.methods.client.terminal.kill, async (ctx: any) => {
    state.terminalRequests.push({ method: "terminal/kill", terminalId: ctx.params.terminalId });
    return {};
  });
  app.onRequest(acp.methods.client.elicitation.create, async (ctx: any) => {
    const params = ctx.params as AnyRecord;
    state.elicitationRequests.push({ mode: params.mode, message: params.message, sessionId: params.sessionId ?? null });
    if (params.sessionId) state.events.push({ sequence: ++state.sequence, sessionId: params.sessionId, kind: "elicitation.requested", data: { mode: params.mode, message: params.message } });
    if (params.sessionId) state.events.push({ sequence: ++state.sequence, sessionId: params.sessionId, kind: "elicitation.resolved", data: { action: "accept" } });
    return { action: "accept", content: { answer: "yes" } };
  });
  void trace;
  return app;
}

function clientCapabilities(): AnyRecord {
  return {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
    session: { configOptions: {} },
    plan: {},
    elicitation: { form: {}, url: {} },
  };
}

function mcpConfig(): AnyRecord[] {
  return [{ type: "http", name: "hass-conx-spike-mcp", url: "http://127.0.0.1:9/hass-conx-spike", headers: [] }];
}

async function writeResult(file: string | undefined, result: ProbeResult): Promise<void> {
  if (!file) return;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
}

function runtimeInfo(): Record<string, unknown> {
  return { node: process.version, platform: process.platform, arch: process.arch, sdk: "@agentclientprotocol/sdk@1.4.0", codexAcp: "@agentclientprotocol/codex-acp@1.7.0" };
}

async function launch(command: string, args: string[], env: NodeJS.ProcessEnv, withClient = true): Promise<Running> {
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env });
  const trace = new Trace();
  const state = { events: [], sequence: 0, permissionRequests: [], permissionResolutions: [], terminalRequests: [], fileRequests: [], elicitationRequests: [] } as Omit<Running, "proc" | "connection" | "trace" | "stderr">;
  const app = withClient ? clientFor(trace, state) : undefined;
  if (!app) throw new Error("internal: launch requires a client app");
  const connection = app.connect(streamForChild(proc, trace));
  return { proc, connection, trace, stderr: [], ...state };
}

async function stop(running: Running, signal: NodeJS.Signals = "SIGTERM", closeConnection = true): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => {
    running.proc.once("exit", (code, childSignal) => resolvePromise({ code, signal: childSignal }));
  });
  if (closeConnection) running.connection.close();
  if (!running.proc.killed) running.proc.kill(signal);
  return Promise.race([exit, wait(3000).then(() => ({ code: null, signal: signal }))]);
}

async function runProvider(provider: "codex" | "cursor", out?: string): Promise<ProbeResult> {
  const runtime = mkdtempSync(`/tmp/hass-conx-acp-${provider}-`);
  const home = join(runtime, "home");
  const codexHome = join(runtime, "codex");
  await mkdir(home, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const spikeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let command: string;
  let args: string[];
  if (provider === "codex") {
    command = join(spikeRoot, "node_modules/@agentclientprotocol/codex-acp/dist/index.js");
    args = [];
  } else {
    command = process.env.CURSOR_ACP_COMMAND || "/Users/nickw/.local/bin/agent";
    args = ["acp"];
  }
  const tests: Record<string, AnyRecord> = {};
  let running: Running | undefined;
  try {
    running = await launch(command, args, safeEnvironment({ HOME: home, CODEX_HOME: codexHome, NO_BROWSER: "1" }));
    const agent: any = running.connection.agent;
    const initialized: AnyRecord = await agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: clientCapabilities(),
      clientInfo: { name: "hass-conx-acp-parity-spike", version: "0.1.0" },
    });
    tests.initialize = { status: "passed", protocolVersion: initialized.protocolVersion, agentInfo: redact(initialized.agentInfo), agentCapabilities: redact(initialized.agentCapabilities) };
    tests.authStatus = { status: "observed", authMethods: redact(initialized.authMethods ?? []) };
    try {
      const session: AnyRecord = await agent.request(acp.methods.agent.session.new, { cwd: spikeRoot, mcpServers: mcpConfig() });
      tests.sessionNew = { status: "passed", sessionId: session.sessionId, modes: redact(session.modes), configOptions: redact(session.configOptions) };
      tests.mcpInjection = { status: "accepted", serverNames: ["hass-conx-spike-mcp"], transport: "http", note: "Endpoint intentionally unavailable; acceptance means the provider accepted the standard ACP session/new shape." };
      const promptEnabled = process.env.ACP_ALLOW_NETWORK_PROMPT === "1";
      tests.promptStreaming = { status: promptEnabled ? "attempted" : "skipped", reason: promptEnabled ? "ACP_ALLOW_NETWORK_PROMPT=1" : "Skipped to avoid model/account/network side effects; fixture covers streaming." };
      if (promptEnabled) {
        const before = running.events.length;
        const response: AnyRecord = await agent.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: "Reply with exactly one short sentence." }] });
        tests.promptStreaming = { status: "passed", stopReason: response.stopReason, updateCount: running.events.length - before };
      }
    } catch (error) {
      tests.sessionNew = { status: "failed", error: redact(String(error)) };
      tests.mcpInjection = { status: "inconclusive", reason: "session/new failed before MCP acceptance could be distinguished", error: redact(String(error)) };
    }
  } catch (error) {
    tests.initialize = { status: "failed", error: redact(String(error)) };
    tests.authStatus = { status: "blocked", reason: "initialize did not return an auth surface" };
  }
  let exit = { code: null as number | null, signal: null as NodeJS.Signals | null };
  if (running) exit = await stop(running);
  const result: ProbeResult = {
    schemaVersion: 1,
    provider,
    mode: "real-provider",
    command,
    args,
    runtime: { ...runtimeInfo(), providerBinary: provider === "cursor" ? (process.env.CURSOR_ACP_COMMAND || command) : "codex-acp package entrypoint", isolatedHome: true, processExit: exit },
    tests,
    normalizedEvents: running?.events ?? [],
  };
  await writeResult(out, result);
  return result;
}

function fixtureStatePath(): string {
  return process.env.FIXTURE_STATE_FILE || join(mkdtempSync("/tmp/hass-conx-acp-fixture-state-"), "sessions.json");
}

async function fixtureAgent(): Promise<void> {
  const stateFile = fixtureStatePath();
  let sessions: Record<string, AnyRecord> = {};
  if (existsSync(stateFile)) {
    try { sessions = JSON.parse(readFileSync(stateFile, "utf8")); } catch { sessions = {}; }
  }
  const turnControllers = new Map<string, AbortController>();
  const fixture = acp.agent({ name: "hass-conx-fixture-agent" });
  fixture.onRequest(acp.methods.agent.initialize, async () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentInfo: { name: "hass-conx-fixture-agent", version: "0.1.0" },
    authMethods: [{ id: "fixture-key", name: "Fixture key", description: "Deterministic fixture authentication status" }],
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: false, audio: false, embeddedContext: true },
      mcpCapabilities: { http: true, sse: true },
      sessionCapabilities: { list: {}, delete: {}, resume: {}, close: {}, additionalDirectories: {} },
    },
  } as any));
  fixture.onRequest(acp.methods.agent.session.new, async (ctx: any) => {
    const sessionId = `fixture-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    sessions[sessionId] = { sessionId, cwd: ctx.params.cwd, mcpServers: ctx.params.mcpServers, history: [] };
    writeFileSync(stateFile, JSON.stringify(sessions));
    return { sessionId, modes: { currentModeId: "agent", availableModes: [{ id: "agent", name: "Agent", description: "Fixture mode" }] } };
  });
  fixture.onRequest(acp.methods.agent.session.load, async (ctx: any) => {
    const session = sessions[ctx.params.sessionId];
    if (!session) throw new Error("fixture session not found");
    for (const text of session.history) await ctx.client.notify(acp.methods.client.session.update, { sessionId: ctx.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text }, messageId: "history-1" } });
    return { modes: { currentModeId: "agent", availableModes: [{ id: "agent", name: "Agent", description: "Fixture mode" }] } };
  });
  fixture.onNotification(acp.methods.agent.session.cancel, async (ctx: any) => {
    turnControllers.get(ctx.params.sessionId)?.abort();
  });
  fixture.onRequest(acp.methods.agent.session.prompt, async (ctx: any) => {
    const sessionId = ctx.params.sessionId;
    const session = sessions[sessionId];
    const promptText = ctx.params.prompt?.map((x: AnyRecord) => x.text ?? "").join("") ?? "";
    if (!session) throw new Error("fixture session not found");
    const controller = new AbortController();
    turnControllers.set(sessionId, controller);
    const signal = controller.signal;
    try {
      if (promptText.includes("cancel")) {
        await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "starting " }, messageId: "cancel-message" } });
        while (!signal.aborted) await wait(20);
        return { stopReason: "cancelled" };
      }
      session.history.push("fixture response");
      writeFileSync(stateFile, JSON.stringify(sessions));
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "checking " }, messageId: "thought-1" } });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "plan", entries: [{ content: "Inspect configuration", priority: "high", status: "in_progress" }] } });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello " }, messageId: "message-1" } });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-read", title: "Read configuration", kind: "read", status: "in_progress", locations: [{ path: `${session.cwd}/configuration.yaml`, line: 1 }], rawInput: { path: "configuration.yaml" } } });
      await ctx.client.request(acp.methods.client.fs.readTextFile, { sessionId, path: `${session.cwd}/configuration.yaml`, line: 1, limit: 20 });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "tool-read", status: "completed", rawOutput: { ok: true } } });
      await ctx.client.request(acp.methods.client.session.requestPermission, { sessionId, toolCall: { toolCallId: "tool-edit", title: "Edit automation", kind: "edit", status: "pending", locations: [{ path: `${session.cwd}/automations.yaml`, line: 4 }] }, options: [{ optionId: "allow-once", name: "Allow once", kind: "allow_once" }, { optionId: "reject-once", name: "Reject", kind: "reject_once" }] });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-edit", title: "Edit automation", kind: "edit", status: "completed", locations: [{ path: `${session.cwd}/automations.yaml`, line: 4 }], rawOutput: { diff: "fixture" } } });
      const terminal = await ctx.client.request(acp.methods.client.terminal.create, { sessionId, command: "ha", args: ["core", "check"], cwd: session.cwd, outputByteLimit: 5000 });
      await ctx.client.request(acp.methods.client.terminal.output, { sessionId, terminalId: terminal.terminalId });
      await ctx.client.request(acp.methods.client.terminal.waitForExit, { sessionId, terminalId: terminal.terminalId });
      await ctx.client.request(acp.methods.client.terminal.release, { sessionId, terminalId: terminal.terminalId });
      await ctx.client.request(acp.methods.client.elicitation.create, { mode: "form", sessionId, message: "Choose fixture value", requestedSchema: { type: "object", properties: { answer: { type: "string", title: "Answer" } } } });
      await ctx.client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "done" }, messageId: "message-1" } });
      return { stopReason: "end_turn" };
    } finally {
      turnControllers.delete(sessionId);
    }
  });
  const stream = acp.ndJsonStream(Writable.toWeb(process.stdout) as WritableStream<Uint8Array>, Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>);
  const connection = fixture.connect(stream);
  await connection.closed;
}

async function startFixture(stateFile: string): Promise<{ running: Running; init: AnyRecord }> {
  const script = fileURLToPath(import.meta.url);
  const proc = spawn(process.execPath, ["--import", "tsx", script, "--fixture-agent"], { stdio: ["pipe", "pipe", "pipe"], env: safeEnvironment({ FIXTURE_STATE_FILE: stateFile, HOME: mkdtempSync("/tmp/hass-conx-fixture-home-") }) });
  const trace = new Trace();
  const state = { events: [], sequence: 0, permissionRequests: [], permissionResolutions: [], terminalRequests: [], fileRequests: [], elicitationRequests: [] } as Omit<Running, "proc" | "connection" | "trace" | "stderr">;
  const app = clientFor(trace, state);
  const connection = app.connect(streamForChild(proc, trace));
  const running = { proc, connection, trace, stderr: [], ...state };
  const init: AnyRecord = await (connection.agent as any).request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: clientCapabilities(), clientInfo: { name: "hass-conx-acp-parity-spike", version: "0.1.0" } });
  return { running, init };
}

async function runFixture(out?: string): Promise<ProbeResult> {
  const stateFile = fixtureStatePath();
  const tests: Record<string, AnyRecord> = {};
  let first: Running | undefined;
  let second: Running | undefined;
  const allEvents: NormalizedEvent[] = [];
  try {
    const started = await startFixture(stateFile);
    first = started.running;
    tests.initialize = { status: "passed", protocolVersion: started.init.protocolVersion, agentInfo: started.init.agentInfo, agentCapabilities: started.init.agentCapabilities };
    tests.authStatus = { status: "observed", authMethods: started.init.authMethods };
    const firstAgent: any = first.connection.agent;
    const session: AnyRecord = await firstAgent.request(acp.methods.agent.session.new, { cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures"), mcpServers: mcpConfig() });
    tests.sessionNew = { status: "passed", sessionId: session.sessionId };
    tests.mcpInjection = { status: "passed", serverNames: ["hass-conx-spike-mcp"], transport: "http", fixtureObserved: true };
    const promptBefore = first.events.length;
    const response: AnyRecord = await firstAgent.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: "exercise fixture" }] });
    tests.promptStreaming = { status: "passed", stopReason: response.stopReason, updateCount: first.events.length - promptBefore };
    tests.permission = { status: first.permissionRequests.length > 0 && first.permissionResolutions.length > 0 ? "passed" : "failed", requests: first.permissionRequests, resolutions: first.permissionResolutions };
    tests.shellTerminal = { status: first.terminalRequests.length >= 4 ? "passed" : "failed", requests: first.terminalRequests };
    tests.fileEvents = { status: first.events.some((event) => event.kind === "file.changed") && first.fileRequests.length > 0 ? "passed" : "failed", clientFileRequests: first.fileRequests };
    tests.elicitation = { status: first.elicitationRequests.length > 0 ? "passed" : "failed", requests: first.elicitationRequests };
    const cancelPrompt: Promise<AnyRecord> = firstAgent.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: "cancel this turn" }] });
    await wait(25);
    await firstAgent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
    const cancelled = await cancelPrompt;
    tests.cancellation = { status: cancelled.stopReason === "cancelled" ? "passed" : "failed", stopReason: cancelled.stopReason };
    allEvents.push(...first.events);
    const crashed = await stop(first, "SIGKILL", false);
    tests.processCrash = { status: crashed.signal === "SIGKILL" ? "passed" : "inconclusive", exit: crashed };
    const resumed = await startFixture(stateFile);
    second = resumed.running;
    const loaded: AnyRecord = await (second.connection.agent as any).request(acp.methods.agent.session.load, { sessionId: session.sessionId, cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures"), mcpServers: mcpConfig() });
    tests.sessionResumeLoad = { status: "passed", sessionId: session.sessionId, historyReplayEvents: second.events.length, modes: loaded.modes };
    allEvents.push(...second.events);
  } catch (error) {
    tests.error = { status: "failed", error: redact(String(error)) };
  } finally {
    if (first && !first.proc.killed) await stop(first);
    if (second && !second.proc.killed) await stop(second);
  }
  const result: ProbeResult = { schemaVersion: 1, provider: "fixture", mode: "fixture", command: process.execPath, args: ["--import", "tsx", "src/probe.ts", "--fixture-agent"], runtime: runtimeInfo(), tests, normalizedEvents: allEvents };
  await writeResult(out, result);
  return result;
}

function parseArgs(): { provider?: "codex" | "cursor"; fixture: boolean; out?: string } {
  const args = process.argv.slice(2);
  const provider = args.includes("--provider") ? args[args.indexOf("--provider") + 1] as "codex" | "cursor" : undefined;
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
  return { provider, fixture: args.includes("--fixture"), out };
}

async function main(): Promise<void> {
  if (process.argv.includes("--fixture-agent")) {
    await fixtureAgent();
    return;
  }
  const args = parseArgs();
  if (args.fixture) {
    const result = await runFixture(args.out);
    console.log(JSON.stringify({ provider: result.provider, tests: result.tests, normalizedEventKinds: [...new Set(result.normalizedEvents.map((event) => event.kind))] }, null, 2));
    return;
  }
  if (!args.provider) throw new Error("Usage: npm run probe -- --provider codex|cursor [--out path], or npm run fixture");
  const result = await runProvider(args.provider, args.out);
  console.log(JSON.stringify({ provider: result.provider, tests: result.tests, normalizedEventKinds: [...new Set(result.normalizedEvents.map((event) => event.kind))] }, null, 2));
}

main().catch((error) => {
  console.error(String(redact(error)));
  process.exitCode = 1;
});
