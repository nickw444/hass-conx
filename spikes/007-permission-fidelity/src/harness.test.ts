import test from "node:test";
import assert from "node:assert/strict";
import { runFixture } from "./harness.js";

test("deterministic fixture covers ACP fidelity boundary", async () => {
  const result = await runFixture();
  const expected = [
    "initialize",
    "sessionNew",
    "directAcpFilesystemEdit",
    "directStorageEdit",
    "shellCommands",
    "permission",
    "mcp",
    "diffsAndLocations",
    "terminalOutput",
    "prompt",
    "cancellation",
    "disconnectPendingPermission",
  ];
  for (const name of expected) assert.equal(result.tests[name]?.status, "passed", name);
  assert.ok(result.events.some((event) => event.kind === "permission.requested"));
  assert.ok(result.events.some((event) => event.kind === "permission.resolved"));
  assert.ok(result.events.some((event) => event.kind === "terminal.output"));
  assert.ok(result.events.some((event) => event.kind === "message.delta"));
  assert.deepEqual(result.workspace.after["mcp-state.json"], "seed\n");
  assert.equal(result.tests.disconnectPendingPermission.resolutionCount, 0);
  for (let index = 1; index < result.events.length; index += 1) {
    assert.equal(result.events[index].sequence, result.events[index - 1].sequence + 1);
  }
});
