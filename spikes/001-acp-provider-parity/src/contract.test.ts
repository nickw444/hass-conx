import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSessionUpdate, redact } from "./contract.js";

test("normalizes message, tool, edit, plan, and unknown updates", () => {
  const id = "fixture-session";
  assert.equal(normalizeSessionUpdate({ sessionId: id, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } } }, 1).kind, "message.delta");
  assert.equal(normalizeSessionUpdate({ sessionId: id, update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "Run", kind: "execute", status: "in_progress", locations: [] } }, 2).kind, "tool.started");
  assert.equal(normalizeSessionUpdate({ sessionId: id, update: { sessionUpdate: "tool_call", toolCallId: "t2", title: "Edit", kind: "edit", status: "completed", locations: [{ path: "/config/configuration.yaml" }] } }, 3).kind, "tool.completed");
  assert.equal(normalizeSessionUpdate({ sessionId: id, update: { sessionUpdate: "plan", entries: [] } }, 4).kind, "plan.updated");
  assert.equal(normalizeSessionUpdate({ sessionId: id, update: { sessionUpdate: "provider_extension", payload: "x" } } as never, 5).kind, "activity.unknown");
});

test("redacts credentials from nested data and URLs", () => {
  const result = redact({ authorization: "Bearer abc", apiKey: "secret", url: "https://example.test/mcp?token=abc" });
  assert.deepEqual(result, { authorization: "[REDACTED]", apiKey: "[REDACTED]", url: "[REDACTED_URL]" });
});
