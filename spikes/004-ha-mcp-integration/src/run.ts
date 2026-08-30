import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { brokerCall, brokerListTools, providerConfigContainsOnlyLocalCapability, redact, SERVER_NAMES, startBroker, startUpstream, type HarnessTrace } from "./broker.js";
import { runProviders } from "./provider-probe.js";

type FixtureResult = Record<string, unknown>;

function outputState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const candidate = value as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };
  if (candidate.structuredContent !== undefined) return candidate.structuredContent;
  const text = candidate.content?.find((part) => part.type === "text")?.text;
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function writeOutput(path: string | undefined, value: unknown): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function status(url: string, init?: RequestInit): Promise<number> {
  const response = await fetch(url, init);
  await response.arrayBuffer();
  return response.status;
}

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("synthetic-upstream-token"), "redacted fixture must not contain upstream token");
  assert(!serialized.includes("local-session-capability"), "redacted fixture must not contain local capability");
}

export async function runFixture(out?: string): Promise<FixtureResult> {
  const trace: HarnessTrace = { entries: [], add: (entry) => trace.entries.push(entry) };
  const upstream = await startUpstream(trace);
  const broker = await startBroker(trace, upstream.url);
  let upstreamDownHealth: unknown;
  let firstHealth: unknown;
  let reconnectHealth: unknown;
  try {
    const providerConfig = broker.providerMcpServers();
    assert.equal(providerConfig.length, 2);
    assert.deepEqual(providerConfig.map((entry) => entry.name), [...SERVER_NAMES]);
    assert(providerConfigContainsOnlyLocalCapability(providerConfig), "ACP-facing config must carry only local capability");
    assert(providerConfig.every((entry) => new URL(entry.url).pathname.startsWith("/")));

    const unauthorizedUpstream = await status(upstream.url);
    const unauthorizedBroker = await status(`${broker.baseUrl}/homeassistant-assist`);
    firstHealth = await broker.health();
    assert.deepEqual(firstHealth, { status: "ok", upstreamTools: ["ha_read_test_state", "ha_set_test_state"] });

    const listedTools = await brokerListTools(trace, broker, "homeassistant-assist");
    assert.deepEqual(listedTools, ["ha_read_test_state", "ha_set_test_state"]);
    const readBefore = outputState(await brokerCall(trace, broker, "homeassistant-assist", "ha_read_test_state"));
    const writeOn = outputState(await brokerCall(trace, broker, "homeassistant-assist", "ha_set_test_state", { enabled: true }));
    const readOn = outputState(await brokerCall(trace, broker, "homeassistant-assist", "ha_read_test_state"));
    const writeOff = outputState(await brokerCall(trace, broker, "homeassistant-assist", "ha_set_test_state", { enabled: false }));
    const readAfter = outputState(await brokerCall(trace, broker, "homeassistant-advanced", "ha_read_test_state"));
    assert.deepEqual(readBefore, { enabled: false });
    assert.deepEqual(writeOn, { enabled: true });
    assert.deepEqual(readOn, { enabled: true });
    assert.deepEqual(writeOff, { enabled: false });
    assert.deepEqual(readAfter, { enabled: false });

    await upstream.close();
    upstreamDownHealth = await broker.health();
    assert.equal((upstreamDownHealth as { status: string }).status, "degraded");
    const restarted = await startUpstream(trace, upstream.port);
    reconnectHealth = await broker.health();
    assert.equal((reconnectHealth as { status: string }).status, "ok");
    const afterReconnect = outputState(await brokerCall(trace, broker, "homeassistant-assist", "ha_read_test_state"));
    assert.deepEqual(afterReconnect, { enabled: false });
    await restarted.close();

    const result: FixtureResult = {
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      protocol: { sdk: "@modelcontextprotocol/{server,node,client}@2.0.0", transport: "Streamable HTTP", mode: "stateless JSON response" },
      upstream: { url: new URL(upstream.url).origin + "/mcp", requiresSyntheticBearer: true, unauthorizedStatus: unauthorizedUpstream },
      broker: { baseUrl: new URL(broker.baseUrl).origin, unauthorizedStatus: unauthorizedBroker, localCapabilityInjectedByClient: true },
      providerMcpServers: redact(providerConfig),
      observed: { serverNames: SERVER_NAMES, toolsList: listedTools, readBefore, writeOn, readOn, writeOff, readAfter, firstHealth, upstreamDownHealth, reconnectHealth, afterReconnect },
      assertions: { providerConfigContainsOnlyLocalCapability: true, upstreamTokenNeverInProviderConfig: true, upstreamAuthInjectedByBroker: trace.entries.some((entry) => entry.upstreamAuthInjected === true), reversibleWriteRestored: (writeOff as { enabled: boolean }).enabled === false, noSensitiveValuesInArtifact: true },
      trace: redact(trace.entries),
    };
    assertNoSecrets(result);
    await writeOutput(out, result);
    return result;
  } finally {
    await broker.close().catch(() => undefined);
    // The normal path closes the restarted instance. On assertion failures the
    // original server may already be closed, so close is intentionally best effort.
    await upstream.close().catch(() => undefined);
  }
}

function parseArgs(args: string[]): { fixture: boolean; out?: string; providers: boolean } {
  const result = { fixture: false, providers: false, out: undefined as string | undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--fixture") result.fixture = true;
    if (arg === "--providers") result.providers = true;
    if (arg === "--out") result.out = args[index + 1];
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out ? resolve(args.out) : resolve("fixtures/mcp-run.json");
  if (args.fixture || !args.providers) {
    const result = await runFixture(out);
    console.log(JSON.stringify({ ok: true, output: out, observed: result.observed }, null, 2));
  } else {
    const result = await runProviders(resolve("fixtures"));
    console.log(JSON.stringify({ ok: true, output: resolve("fixtures/providers-run.json"), providers: Object.keys(result.providers as object) }, null, 2));
  }
}
