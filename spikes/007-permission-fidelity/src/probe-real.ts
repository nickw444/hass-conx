import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import { canonicalize, redact } from "./contract.js";

type Provider = "codex" | "cursor";
type AnyRecord = Record<string, any>;
type WireChunk = { direction: "client->agent" | "agent->client" | "stderr"; text: string };

function safeEnvironment(home: string, codexHome: string, cursorHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    HOME: home,
    CODEX_HOME: codexHome,
    CURSOR_CONFIG_DIR: cursorHome,
    CURSOR_DATA_DIR: cursorHome,
    NO_BROWSER: "1",
  };
}

function streamForChild(proc: ChildProcessWithoutNullStreams, trace: WireChunk[]): acp.Stream {
  const toAgent = new PassThrough();
  const fromAgent = new PassThrough();
  toAgent.on("data", (chunk) => trace.push({ direction: "client->agent", text: String(redact(Buffer.from(chunk).toString("utf8"))) }));
  fromAgent.on("data", (chunk) => trace.push({ direction: "agent->client", text: String(redact(Buffer.from(chunk).toString("utf8"))) }));
  proc.stderr.on("data", (chunk) => trace.push({ direction: "stderr", text: String(redact(Buffer.from(chunk).toString("utf8"))) }));
  toAgent.pipe(proc.stdin);
  proc.stdout.pipe(fromAgent);
  return acp.ndJsonStream(Writable.toWeb(toAgent) as WritableStream<Uint8Array>, Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>);
}

function capabilities(): AnyRecord {
  return { fs: { readTextFile: false, writeTextFile: false }, terminal: false };
}

async function probe(provider: Provider): Promise<AnyRecord> {
  const root = await mkdtemp(`/tmp/hass-conx-acp-fidelity-${provider}-`);
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const cursorHome = join(root, "cursor");
  await Promise.all([mkdir(home), mkdir(codexHome), mkdir(cursorHome)]);
  const spikeRoot = dirname(fileURLToPath(import.meta.url));
  const command = provider === "codex"
    ? join(spikeRoot, "../node_modules/@agentclientprotocol/codex-acp/dist/index.js")
    : process.env.CURSOR_ACP_COMMAND || "/Users/nickw/.local/bin/agent";
  const args = provider === "codex" ? [] : ["acp"];
  const trace: WireChunk[] = [];
  const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: safeEnvironment(home, codexHome, cursorHome) });
  const app = acp.client({ name: "hass-conx-permission-fidelity-probe" });
  const connection = app.connect(streamForChild(proc, trace));
  const tests: AnyRecord = {};
  try {
    const initialize: AnyRecord = await (connection.agent as any).request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: capabilities(),
      clientInfo: { name: "hass-conx-permission-fidelity-probe", version: "0.1.0" },
    });
    tests.initialize = { status: "passed", protocolVersion: initialize.protocolVersion, agentInfo: redact(initialize.agentInfo), agentCapabilities: redact(initialize.agentCapabilities), authMethods: redact(initialize.authMethods ?? []) };
    try {
      const session: AnyRecord = await (connection.agent as any).request(acp.methods.agent.session.new, { cwd: root, mcpServers: [] });
      tests.sessionNew = { status: "passed", sessionId: session.sessionId };
    } catch (error) {
      tests.sessionNew = { status: "blocked-or-failed", error: redact(String(error)), interpretation: "No authenticate call was made; this records the provider's unauthenticated gate." };
    }
  } catch (error) {
    tests.initialize = { status: "failed", error: redact(String(error)) };
  } finally {
    connection.close();
    if (!proc.killed) proc.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => proc.once("exit", () => resolvePromise()));
  }
  return canonicalize({
    schemaVersion: 1,
    provider,
    mode: "isolated-unauthenticated-probe",
    command,
    args,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, sdk: "@agentclientprotocol/sdk@1.4.0", isolatedHome: true, authenticateCalled: false, credentialEnvironmentForwarded: false },
    tests,
  }, root) as AnyRecord;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : undefined;
  const providers: Provider[] = providerArg ? [providerArg as Provider] : ["codex", "cursor"];
  const results = await Promise.all(providers.map((provider) => probe(provider)));
  const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
  const output = { schemaVersion: 1, observedAt: new Date().toISOString().slice(0, 10), results };
  if (outArg) await writeFile(outArg, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(String(redact(error)));
  process.exitCode = 1;
});
