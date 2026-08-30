import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_VERSION,
  INTERACTION_STATES,
  RecoveryCoordinator,
  RecoveryError,
  RecoveryStore,
  SCHEMA_VERSION,
  SESSION_STATES,
  TURN_STATES,
} from "./recovery.mjs";

const providerCapabilityFixtures = JSON.parse(readFileSync(
  new URL("./fixtures/provider-capabilities.json", import.meta.url),
  "utf8",
));

function fixture({ loadSupported = true, resumeSupported = false, provider = "codex" } = {}) {
  const coordinator = new RecoveryCoordinator({
    providers: {
      codex: { loadSessionSupported: loadSupported, resumeSessionSupported: resumeSupported },
      cursor: { loadSessionSupported: false },
    },
  });
  coordinator.createSession({
    sessionId: "session-a",
    provider,
    providerSessionId: "provider-session-a",
    cwd: "/config",
    resumeSupported,
  });
  return coordinator;
}

function events(coordinator, sessionId = "session-a") {
  return coordinator.store.data.events.filter((event) => event.sessionId === sessionId);
}

test("Spike 001 capability fixtures are consumed without treating auth-gated probes as proof of recovery", () => {
  assert.equal(providerCapabilityFixtures.protocolVersion, 1);
  assert.equal(providerCapabilityFixtures.codex.agentCapabilities.loadSession, true);
  assert.equal(providerCapabilityFixtures.codex.agentCapabilities.sessionCapabilities.resume !== undefined, true);
  assert.equal(providerCapabilityFixtures.cursor.agentCapabilities.sessionCapabilities.load, undefined);
  assert.deepEqual(providerCapabilityFixtures.cursor.authMethods, ["cursor_login"]);
});

test("one active conversation owns one ACP subprocess and one foreground turn", () => {
  const coordinator = fixture();
  const first = coordinator.startTurn("session-a", { turnId: "turn-a" });
  assert.equal(coordinator.startProcess("session-a").processId, first.processId);
  assert.throws(() => coordinator.startTurn("session-a", { turnId: "turn-b" }), (error) => error.code === "turn_already_active");
  assert.equal(Object.values(coordinator.store.data.processes).length, 1);
  assert.equal(coordinator.session("session-a").activeProcessId, first.processId);
  coordinator.createSession({ sessionId: "session-b", provider: "codex", providerSessionId: "provider-session-b" });
  const second = coordinator.startTurn("session-b", { turnId: "turn-b" });
  assert.notEqual(second.processId, first.processId);
  assert.equal(Object.values(coordinator.store.data.processes).filter((process) => process.state === "running").length, 2);
});

test("browser disconnect keeps work and pending interaction alive; reconnect replays a strict suffix", () => {
  const coordinator = fixture();
  const turn = coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.providerEvent("session-a", {
    processId: turn.processId,
    turnId: turn.turnId,
    kind: "message.delta",
    payload: { text: "partial", providerHistoryId: "h1" },
  });
  const beforePermission = coordinator.session("session-a").lastSequence;
  coordinator.requestInteraction("session-a", {
    kind: "permission",
    providerRequestId: "permission-1",
    optionIds: ["allow-once", "reject-once"],
  });
  const pendingSequence = coordinator.session("session-a").lastSequence;
  coordinator.connectBrowser({ connectionId: "browser-1", sessionId: "session-a", lastSeenSequence: 0 });
  coordinator.disconnectBrowser("browser-1");
  assert.equal(coordinator.session("session-a").turnState, TURN_STATES.waitingPermission);
  assert.equal(coordinator.session("session-a").pendingInteractionId !== null, true);
  assert.equal(coordinator.processFor("session-a").state, "running");
  const reconnect = coordinator.connectBrowser({ connectionId: "browser-2", sessionId: "session-a", lastSeenSequence: beforePermission });
  assert.deepEqual(reconnect.replay.events.map((event) => event.sequence), [beforePermission + 1]);
  assert.equal(reconnect.replay.throughSequence, pendingSequence);
  assert.equal(reconnect.session.pendingInteraction.state, INTERACTION_STATES.pending);
  assert.equal(reconnect.session.pendingInteraction.optionIds.includes("allow-once"), true);
});

test("reconnect rejects sequence ahead and stale mutation commands", () => {
  const coordinator = fixture();
  coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.requestInteraction("session-a", {
    kind: "elicitation",
    providerRequestId: "elicitation-1",
    optionIds: ["yes", "no"],
  });
  const current = coordinator.session("session-a").lastSequence;
  coordinator.connectBrowser({ connectionId: "browser-1", sessionId: "session-a", lastSeenSequence: current });
  assert.throws(() => coordinator.connectBrowser({ connectionId: "browser-2", sessionId: "session-a", lastSeenSequence: current + 1 }), (error) => error.code === "sequence_ahead");
  const interactionId = coordinator.session("session-a").pendingInteractionId;
  const accepted = coordinator.browserCommand("browser-1", {
    commandId: "command-1",
    sessionId: "session-a",
    expectedSequence: current,
    type: "interaction.resolve",
    interactionId,
    value: "yes",
  });
  assert.equal(accepted.status, "accepted");
  const duplicate = coordinator.browserCommand("browser-1", {
    commandId: "command-1",
    sessionId: "session-a",
    expectedSequence: current,
    type: "interaction.resolve",
    interactionId,
    value: "yes",
  });
  assert.equal(duplicate.duplicate, true);
  const stale = coordinator.browserCommand("browser-1", {
    commandId: "command-2",
    sessionId: "session-a",
    expectedSequence: current,
    type: "turn.cancel",
  });
  assert.equal(stale.code, "stale_command");
});

test("backend restart preserves an idle session without inventing an orphan", () => {
  const coordinator = fixture();
  const process = coordinator.startProcess("session-a");
  coordinator.gracefulShutdown("backend_restart_idle");
  const restarted = RecoveryCoordinator.restart(coordinator.store.snapshot(), {
    providers: { codex: { loadSessionSupported: true } },
    appVersion: APP_VERSION,
  });
  assert.equal(restarted.session("session-a").state, SESSION_STATES.idle);
  assert.equal(restarted.processFor("session-a"), null);
  assert.equal(restarted.store.data.processes[process.processId].state, "stopped");
  assert.equal(restarted.store.data.events.some((event) => event.kind === "turn.interrupted"), false);
});

test("backend restart mid-turn marks the turn and pending interaction orphaned", () => {
  const coordinator = fixture();
  const turn = coordinator.startTurn("session-a", { turnId: "turn-a" });
  const interaction = coordinator.requestInteraction("session-a", {
    kind: "elicitation",
    providerRequestId: "elicitation-1",
    optionIds: ["done"],
  });
  const restarted = RecoveryCoordinator.restart(coordinator.store.snapshot(), {
    providers: { codex: { loadSessionSupported: true } },
  });
  assert.equal(restarted.session("session-a").state, SESSION_STATES.orphaned);
  assert.equal(restarted.session("session-a").turnState, TURN_STATES.interrupted);
  assert.equal(restarted.store.data.interactions[interaction.interactionId].state, INTERACTION_STATES.orphaned);
  assert.equal(restarted.store.data.interactions[interaction.interactionId].orphanReason, "backend_restart_orphan");
  assert.equal(restarted.session("session-a").activeProcessId, null);
  assert.equal(restarted.store.data.processes[turn.processId].state, "exited");
  assert.equal(events(restarted).filter((event) => event.kind === "elicitation.orphaned").length, 1);
  assert.throws(() => restarted.browserCommand("missing", {}), (error) => error.code === "browser_not_connected");
});

test("agent SIGKILL is terminal for the process, but recovery remains explicit and idempotent", () => {
  const coordinator = fixture();
  const turn = coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.requestInteraction("session-a", {
    kind: "permission",
    providerRequestId: "permission-1",
    optionIds: ["allow"],
  });
  const exit = coordinator.agentExit("session-a", { signal: "SIGKILL", reason: "agent_sigkill" });
  assert.equal(exit.state, "killed");
  assert.equal(coordinator.session("session-a").turnState, TURN_STATES.interrupted);
  assert.equal(coordinator.agentExit("session-a", { signal: "SIGKILL" }).ignored, true);
  assert.equal(events(coordinator).filter((event) => event.kind === "process.exited").length, 1);
  assert.equal(coordinator.session("session-a").activeTurnId, null);
  assert.equal(coordinator.session("session-a").lastInterruptedTurnId, turn.turnId);
});

test("supported session/load recovers provider context without replaying local prompts", () => {
  const coordinator = fixture();
  const turn = coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.providerEvent("session-a", {
    processId: turn.processId,
    turnId: turn.turnId,
    kind: "message.delta",
    payload: { text: "local", providerHistoryId: "h1" },
  });
  coordinator.agentExit("session-a", { signal: "SIGKILL", reason: "crash" });
  const recovered = coordinator.recoverSession("session-a", { providerHistory: [{ id: "h1" }] });
  assert.equal(recovered.status, SESSION_STATES.idle);
  assert.equal(recovered.history, "aligned");
  assert.equal(coordinator.session("session-a").historyState, "aligned");
  assert.equal(coordinator.session("session-a").activeTurnId, null);
  assert.equal(Object.values(coordinator.store.data.processes).filter((p) => p.state === "running").length, 1);
  assert.equal(events(coordinator).filter((event) => event.kind === "user.prompt.replayed").length, 0);
  const nextTurn = coordinator.startTurn("session-a", { turnId: "turn-after-recovery" });
  assert.equal(nextTurn.processId, coordinator.processFor("session-a").processId);
});

test("unsupported session/load refuses silent local-history replay", () => {
  const coordinator = fixture({ loadSupported: false, provider: "cursor" });
  coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.agentExit("session-a", { signal: "SIGKILL", reason: "crash" });
  const result = coordinator.recoverSession("session-a");
  assert.equal(result.status, "unsupported");
  assert.equal(coordinator.session("session-a").state, SESSION_STATES.recoveryRequired);
  assert.equal(coordinator.processFor("session-a"), null);
  assert.equal(events(coordinator).at(-1).kind, "session.recovery.unsupported");
});

test("stable session/resume recovers provider context without pretending to replay provider history", () => {
  const coordinator = fixture({ loadSupported: false, resumeSupported: true });
  coordinator.startTurn("session-a", { turnId: "turn-a" });
  coordinator.agentExit("session-a", { signal: "SIGKILL", reason: "crash" });
  const result = coordinator.recoverSession("session-a", { providerHistory: [{ id: "ignored-by-resume" }] });
  assert.equal(result.status, SESSION_STATES.idle);
  assert.equal(result.method, "resume");
  assert.equal(result.history, "provider_resumed");
  assert.equal(coordinator.session("session-a").historyState, "provider_resumed");
  assert.equal(events(coordinator).some((event) => event.kind === "history.reconciled"), false);
});

test("provider-history reconciliation distinguishes ahead, behind, and divergent histories", () => {
  const providerAhead = fixture();
  providerAhead.startTurn("session-a", { turnId: "turn-a" });
  providerAhead.providerEvent("session-a", {
    processId: providerAhead.processFor("session-a").processId,
    turnId: "turn-a",
    kind: "message.delta",
    payload: { providerHistoryId: "h1" },
  });
  assert.equal(providerAhead.reconcileProviderHistory("session-a", [{ id: "h1" }, { id: "h2" }]).status, "provider_ahead");

  const localAhead = fixture();
  localAhead.startTurn("session-a", { turnId: "turn-a" });
  localAhead.providerEvent("session-a", {
    processId: localAhead.processFor("session-a").processId,
    turnId: "turn-a",
    kind: "message.delta",
    payload: { providerHistoryId: "h1" },
  });
  assert.equal(localAhead.reconcileProviderHistory("session-a", []).status, "local_ahead");

  const divergent = fixture();
  divergent.startTurn("session-a", { turnId: "turn-a" });
  divergent.providerEvent("session-a", {
    processId: divergent.processFor("session-a").processId,
    turnId: "turn-a",
    kind: "message.delta",
    payload: { providerHistoryId: "h1" },
  });
  assert.equal(divergent.reconcileProviderHistory("session-a", [{ id: "other" }]).status, "diverged");
  assert.equal(divergent.reconcileProviderHistory("session-a", [{ id: "other" }]).action, "block_automatic_prompt_replay");
});

test("schema migration adds recovery fields and rejects unknown future schema", () => {
  const old = {
    schemaVersion: 1,
    appVersion: "old-app",
    sessions: {
      "session-a": { sessionId: "session-a", provider: "codex", status: "running", lastSequence: 1 },
    },
    events: [{ sessionId: "session-a", sequence: 1, kind: "message.delta", data: { text: "old" } }],
  };
  const store = RecoveryStore.fromSnapshot(old);
  assert.equal(store.data.schemaVersion, SCHEMA_VERSION);
  assert.equal(store.data.sessions["session-a"].turnState, TURN_STATES.interrupted);
  assert.equal(store.data.events[0].schemaVersion, 1);
  assert.equal(store.data.events[0].payload.text, "old");
  assert.equal(store.data.appEvents[0].kind, "schema.migrated");
  assert.throws(() => RecoveryStore.fromSnapshot({ schemaVersion: SCHEMA_VERSION + 1 }), (error) => error.code === "newer_schema_version");
});

test("app upgrade is recorded outside the per-session sequence", () => {
  const old = new RecoveryCoordinator({ appVersion: "spike-006-contract-0" });
  old.createSession({ sessionId: "session-a", provider: "codex" });
  const upgraded = RecoveryCoordinator.restart(old.store.snapshot(), { appVersion: APP_VERSION });
  assert.equal(upgraded.store.data.appVersion, APP_VERSION);
  assert.equal(upgraded.store.data.appEvents.some((event) => event.kind === "app.upgraded"), true);
  assert.equal(upgraded.session("session-a").lastSequence, old.session("session-a").lastSequence);
});

test("provider and browser events remain ordered and stale provider events are rejected", () => {
  const coordinator = fixture();
  const turn = coordinator.startTurn("session-a", { turnId: "turn-a" });
  const first = coordinator.providerEvent("session-a", { processId: turn.processId, turnId: turn.turnId, kind: "message.delta", payload: { text: "one" } });
  const second = coordinator.providerEvent("session-a", { processId: turn.processId, turnId: turn.turnId, kind: "message.delta", payload: { text: "two" } });
  assert.equal(second.sequence, first.sequence + 1);
  assert.throws(() => coordinator.providerEvent("session-a", { processId: "old-process", turnId: turn.turnId, kind: "message.delta" }), (error) => error.code === "stale_process_event");
  coordinator.providerEvent("session-a", { processId: turn.processId, turnId: turn.turnId, kind: "turn.completed", payload: { stopReason: "end_turn" } });
  assert.equal(coordinator.session("session-a").turnState, TURN_STATES.completed);
});
