import { strict as assert } from "node:assert";
import test from "node:test";
import { providerConfigContainsOnlyLocalCapability, redact, SERVER_NAMES } from "./broker.js";
import { runFixture } from "./run.js";

test("provider-facing configuration uses stable names and never contains upstream credentials", () => {
  const config = SERVER_NAMES.map((name) => ({ type: "http" as const, name, url: `http://127.0.0.1:1234/${name}`, headers: [{ name: "Authorization", value: "Bearer local-session-capability" }] }));
  assert.equal(providerConfigContainsOnlyLocalCapability(config), true);
  assert.equal(JSON.stringify(redact(config)).includes("synthetic-upstream-token"), false);
  assert.equal(JSON.stringify(redact(config)).includes("local-session-capability"), false);
  assert.equal(JSON.stringify(redact({ url: "https://ha.invalid/api/mcp?access_token=secret" })).includes("access_token=secret"), false);
});

test("official MCP Streamable HTTP upstream and local broker exercise tools and reconnect", async () => {
  const result = await runFixture();
  const observed = result.observed as Record<string, any>;
  const assertions = result.assertions as Record<string, any>;
  assert.deepEqual(observed.serverNames, [...SERVER_NAMES]);
  assert.deepEqual(observed.toolsList, ["ha_read_test_state", "ha_set_test_state"]);
  assert.deepEqual(observed.readBefore, { enabled: false });
  assert.deepEqual(observed.writeOn, { enabled: true });
  assert.deepEqual(observed.writeOff, { enabled: false });
  assert.deepEqual(observed.afterReconnect, { enabled: false });
  assert.equal(assertions.upstreamAuthInjectedByBroker, true);
  assert.equal(assertions.reversibleWriteRestored, true);
  assert.equal(assertions.noSensitiveValuesInArtifact, true);
});
