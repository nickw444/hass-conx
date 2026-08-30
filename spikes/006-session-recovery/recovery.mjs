/**
 * Spike 006: deterministic ACP session/recovery contract.
 *
 * This is deliberately dependency-free. It models the application-owned
 * journal and process manager around ACP; it does not start a provider,
 * inspect credentials, or pretend that local events are provider context.
 */

export const SCHEMA_VERSION = 2;
export const APP_VERSION = "spike-006-contract-1";

export const SESSION_STATES = Object.freeze({
  idle: "idle",
  running: "running",
  orphaned: "orphaned",
  recoveryRequired: "recovery_required",
});

export const TURN_STATES = Object.freeze({
  idle: "idle",
  running: "running",
  waitingPermission: "waiting_permission",
  waitingElicitation: "waiting_elicitation",
  cancelRequested: "cancel_requested",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
});

export const INTERACTION_STATES = Object.freeze({
  pending: "pending",
  resolved: "resolved",
  cancelled: "cancelled",
  orphaned: "orphaned",
});

const RECOVERABLE_HISTORY_STATES = new Set(["aligned", "provider_ahead", "provider_resumed"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new RecoveryError(`${name}_required`);
  }
}

export class RecoveryError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "RecoveryError";
    this.code = code;
  }
}

function emptySnapshot(appVersion = APP_VERSION) {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    clock: 0,
    nextId: 1,
    sessions: {},
    events: [],
    appEvents: [],
    commands: {},
    interactions: {},
    processes: {},
  };
}

/**
 * Migrate a persisted snapshot without rewriting its event history. Older
 * events keep their original schemaVersion; migration is recorded as an
 * application event and new events use the current schema.
 */
export function migrateSnapshot(input, targetVersion = SCHEMA_VERSION) {
  if (!isRecord(input)) throw new RecoveryError("invalid_snapshot");
  const current = Number.isInteger(input.schemaVersion) ? input.schemaVersion : 1;
  if (current > targetVersion) {
    throw new RecoveryError("newer_schema_version");
  }
  const data = clone(input);
  data.sessions = isRecord(data.sessions) ? data.sessions : {};
  data.events = Array.isArray(data.events) ? data.events : [];
  data.appEvents = Array.isArray(data.appEvents) ? data.appEvents : [];
  data.commands = isRecord(data.commands) ? data.commands : {};
  data.interactions = isRecord(data.interactions) ? data.interactions : {};
  data.processes = isRecord(data.processes) ? data.processes : {};
  data.clock = Number.isInteger(data.clock) ? data.clock : 0;
  data.nextId = Number.isInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1;

  let version = current;
  while (version < targetVersion) {
    if (version === 1) {
      for (const event of data.events) {
        if (!Number.isInteger(event.schemaVersion)) event.schemaVersion = 1;
        if (!event.payload && event.data) event.payload = event.data;
        if (!event.payload) event.payload = {};
      }
      for (const session of Object.values(data.sessions)) {
        if (!isRecord(session)) continue;
        session.sessionId ??= session.id;
        session.provider ??= "unknown";
        session.providerSessionId ??= null;
        session.state ??= session.status === "running"
          ? SESSION_STATES.orphaned
          : SESSION_STATES.idle;
        session.turnState ??= session.status === "running"
          ? TURN_STATES.interrupted
          : TURN_STATES.idle;
        session.activeTurnId ??= null;
        session.lastInterruptedTurnId ??= null;
        session.activeProcessId ??= session.processId ?? null;
        session.pendingInteractionId ??= null;
        session.loadSupported ??= false;
        session.resumeSupported ??= false;
        session.historyState ??= "unknown";
        session.lastSequence ??= 0;
        session.updatedAt ??= 0;
      }
      data.appVersion ??= "pre-006";
      data.schemaVersion = 2;
      data.appEvents.push({
        eventId: "migration-1-to-2",
        schemaVersion: 2,
        kind: "schema.migrated",
        payload: { from: 1, to: 2 },
        createdAt: data.clock,
      });
      version = 2;
      continue;
    }
    throw new RecoveryError("unsupported_migration", `No migration from schema ${version}`);
  }
  data.schemaVersion = targetVersion;
  data.appVersion ??= APP_VERSION;
  return { snapshot: data, migratedFrom: current < targetVersion ? current : null };
}

export class RecoveryStore {
  constructor(snapshot = emptySnapshot()) {
    this.data = clone(snapshot);
    this.data.schemaVersion = SCHEMA_VERSION;
    this.data.appVersion ??= APP_VERSION;
    this.data.clock ??= 0;
    this.data.nextId ??= 1;
    this.data.sessions ??= {};
    this.data.events ??= [];
    this.data.appEvents ??= [];
    this.data.commands ??= {};
    this.data.interactions ??= {};
    this.data.processes ??= {};
  }

  static fromSnapshot(input) {
    const result = migrateSnapshot(input);
    const store = new RecoveryStore(result.snapshot);
    store.migratedFrom = result.migratedFrom;
    return store;
  }

  snapshot() {
    return clone(this.data);
  }

  nextId(prefix) {
    const id = `${prefix}-${this.data.nextId}`;
    this.data.nextId += 1;
    return id;
  }

  tick() {
    this.data.clock += 1;
    return this.data.clock;
  }

  session(sessionId) {
    const session = this.data.sessions[sessionId];
    if (!session) throw new RecoveryError("session_not_found");
    return session;
  }

  createSession({ sessionId, provider, providerSessionId = null, cwd = "/config", loadSupported = false, resumeSupported = false }) {
    assertString(sessionId, "session_id");
    assertString(provider, "provider");
    if (this.data.sessions[sessionId]) throw new RecoveryError("session_exists");
    this.data.sessions[sessionId] = {
      sessionId,
      provider,
      providerSessionId,
      cwd,
      state: SESSION_STATES.idle,
      turnState: TURN_STATES.idle,
      activeTurnId: null,
      lastInterruptedTurnId: null,
      activeProcessId: null,
      processGeneration: 0,
      pendingInteractionId: null,
      loadSupported: Boolean(loadSupported),
      resumeSupported: Boolean(resumeSupported),
      historyState: "unknown",
      lastSequence: 0,
      updatedAt: this.tick(),
    };
    this.append(sessionId, "session.created", {
      provider,
      providerSessionId,
      cwd,
      loadSupported: Boolean(loadSupported),
      resumeSupported: Boolean(resumeSupported),
    });
    return clone(this.data.sessions[sessionId]);
  }

  append(sessionId, kind, payload = {}, meta = {}) {
    assertString(sessionId, "session_id");
    assertString(kind, "event_kind");
    const session = this.session(sessionId);
    const sequence = session.lastSequence + 1;
    const event = {
      eventId: this.nextId("event"),
      schemaVersion: SCHEMA_VERSION,
      sessionId,
      sequence,
      turnId: meta.turnId ?? session.activeTurnId ?? null,
      processId: meta.processId ?? session.activeProcessId ?? null,
      kind,
      payload: clone(payload),
      source: meta.source ?? "application",
      createdAt: this.tick(),
    };
    this.data.events.push(event);
    session.lastSequence = sequence;
    session.updatedAt = event.createdAt;
    return clone(event);
  }

  appendAppEvent(kind, payload = {}) {
    const event = {
      eventId: this.nextId("app-event"),
      schemaVersion: SCHEMA_VERSION,
      kind,
      payload: clone(payload),
      createdAt: this.tick(),
    };
    this.data.appEvents.push(event);
    return clone(event);
  }

  sessionEvents(sessionId, afterSequence = 0) {
    return this.data.events
      .filter((event) => event.sessionId === sessionId && event.sequence > afterSequence)
      .map(clone);
  }
}

function providerConfig(providers, provider) {
  const config = providers[provider];
  return {
    loadSessionSupported: Boolean(config?.loadSessionSupported),
    resumeSessionSupported: Boolean(config?.resumeSessionSupported),
  };
}

function publicInteraction(interaction) {
  if (!interaction) return null;
  return {
    interactionId: interaction.interactionId,
    kind: interaction.kind,
    providerRequestId: interaction.providerRequestId,
    turnId: interaction.turnId,
    processId: interaction.processId,
    state: interaction.state,
    optionIds: interaction.optionIds,
    orphanReason: interaction.orphanReason ?? null,
  };
}

function historyIdsFromStore(store, sessionId) {
  return store.data.events
    .filter((event) => event.sessionId === sessionId && typeof event.payload?.providerHistoryId === "string")
    .map((event) => event.payload.providerHistoryId);
}

function relation(localIds, providerIds) {
  if (JSON.stringify(localIds) === JSON.stringify(providerIds)) return "aligned";
  if (localIds.every((id, index) => providerIds[index] === id)) return "provider_ahead";
  if (providerIds.every((id, index) => localIds[index] === id)) return "local_ahead";
  return "diverged";
}

export class RecoveryCoordinator {
  constructor({ store = new RecoveryStore(), providers = {}, appVersion = APP_VERSION } = {}) {
    this.store = store;
    this.providers = providers;
    this.appVersion = appVersion;
    this.connections = new Map();
    if (this.store.data.appVersion !== appVersion) {
      this.store.appendAppEvent("app.upgraded", { from: this.store.data.appVersion, to: appVersion });
      this.store.data.appVersion = appVersion;
    }
  }

  static restart(snapshot, options = {}) {
    const store = RecoveryStore.fromSnapshot(snapshot);
    const coordinator = new RecoveryCoordinator({ ...options, store });
    coordinator.recoverAfterRestart();
    return coordinator;
  }

  createSession(options) {
    const config = providerConfig(this.providers, options.provider);
    return this.store.createSession({
      ...options,
      loadSupported: options.loadSupported ?? config.loadSessionSupported,
      resumeSupported: options.resumeSupported ?? config.resumeSessionSupported,
    });
  }

  session(sessionId) {
    return this.store.session(sessionId);
  }

  processFor(sessionId) {
    const session = this.session(sessionId);
    return session.activeProcessId ? this.store.data.processes[session.activeProcessId] : null;
  }

  startProcess(sessionId) {
    const session = this.session(sessionId);
    const existing = this.processFor(sessionId);
    if (existing?.state === "running") return clone(existing);
    const processId = this.store.nextId("process");
    session.processGeneration += 1;
    session.activeProcessId = processId;
    const process = {
      processId,
      sessionId,
      generation: session.processGeneration,
      state: "running",
      startedAt: this.store.tick(),
      endedAt: null,
      exitReason: null,
    };
    this.store.data.processes[processId] = process;
    this.store.append(sessionId, "process.started", { processId, generation: process.generation }, { processId });
    return clone(process);
  }

  startTurn(sessionId, { turnId = null } = {}) {
    const session = this.session(sessionId);
    if (session.state === SESSION_STATES.recoveryRequired) {
      throw new RecoveryError("recovery_required");
    }
    if (session.activeTurnId) throw new RecoveryError("turn_already_active");
    const process = this.startProcess(sessionId);
    const id = turnId ?? this.store.nextId("turn");
    session.activeTurnId = id;
    session.state = SESSION_STATES.running;
    session.turnState = TURN_STATES.running;
    this.store.append(sessionId, "turn.started", { turnId: id }, { turnId: id, processId: process.processId });
    return { turnId: id, processId: process.processId };
  }

  providerEvent(sessionId, { processId, turnId, kind, payload = {} }) {
    const session = this.session(sessionId);
    const process = this.processFor(sessionId);
    if (!process || process.state !== "running" || process.processId !== processId) {
      throw new RecoveryError("stale_process_event");
    }
    if (session.activeTurnId !== turnId) throw new RecoveryError("stale_turn_event");
    if (kind === "turn.completed" || kind === "turn.failed" || kind === "turn.cancelled") {
      session.activeTurnId = null;
      session.state = SESSION_STATES.idle;
      session.turnState = kind === "turn.completed"
        ? TURN_STATES.completed
        : kind === "turn.cancelled" ? TURN_STATES.cancelled : TURN_STATES.failed;
    }
    return this.store.append(sessionId, kind, payload, { turnId, processId, source: "provider" });
  }

  requestInteraction(sessionId, { kind, providerRequestId, turnId = null, optionIds = [] }) {
    const session = this.session(sessionId);
    const process = this.processFor(sessionId);
    const activeTurnId = turnId ?? session.activeTurnId;
    if (!process || process.state !== "running" || !activeTurnId || session.activeTurnId !== activeTurnId) {
      throw new RecoveryError("turn_not_active");
    }
    if (session.pendingInteractionId) throw new RecoveryError("interaction_already_pending");
    if (kind !== "permission" && kind !== "elicitation") throw new RecoveryError("unknown_interaction_kind");
    assertString(providerRequestId, "provider_request_id");
    const interactionId = this.store.nextId("interaction");
    const interaction = {
      interactionId,
      sessionId,
      kind,
      providerRequestId,
      turnId: activeTurnId,
      processId: process.processId,
      optionIds: [...optionIds],
      state: INTERACTION_STATES.pending,
      createdAt: this.store.tick(),
      resolvedAt: null,
      orphanReason: null,
    };
    this.store.data.interactions[interactionId] = interaction;
    session.pendingInteractionId = interactionId;
    session.turnState = kind === "permission"
      ? TURN_STATES.waitingPermission
      : TURN_STATES.waitingElicitation;
    this.store.append(sessionId, `${kind}.requested`, {
      interactionId,
      providerRequestId,
      turnId: activeTurnId,
      optionIds: [...optionIds],
    }, { turnId: activeTurnId, processId: process.processId, source: "provider" });
    return clone(interaction);
  }

  agentExit(sessionId, { signal = null, code = null, reason = "agent_exit" } = {}) {
    const session = this.session(sessionId);
    const process = this.processFor(sessionId);
    if (!process || process.state !== "running") return { ignored: true, reason: "process_not_running" };
    process.state = signal === "SIGKILL" ? "killed" : "exited";
    process.endedAt = this.store.tick();
    process.exitReason = reason;
    const processId = process.processId;
    const turnId = session.activeTurnId;
    session.activeProcessId = null;
    if (turnId) {
      session.state = SESSION_STATES.orphaned;
      session.turnState = TURN_STATES.interrupted;
      session.lastInterruptedTurnId = turnId;
    }
    this.store.append(sessionId, "process.exited", { processId, signal, code, reason }, { processId, turnId });
    if (turnId) this.store.append(sessionId, "turn.interrupted", { turnId, reason }, { processId, turnId });
    session.activeTurnId = null;
    this.orphanInteractions(sessionId, processId, reason);
    return { processId, turnId, state: process.state };
  }

  gracefulShutdown(reason = "backend_restart") {
    for (const process of Object.values(this.store.data.processes)) {
      if (process.state !== "running") continue;
      const session = this.session(process.sessionId);
      process.state = "stopped";
      process.endedAt = this.store.tick();
      process.exitReason = reason;
      session.activeProcessId = null;
      if (session.activeTurnId) {
        const turnId = session.activeTurnId;
        session.state = SESSION_STATES.orphaned;
        session.turnState = TURN_STATES.interrupted;
        session.lastInterruptedTurnId = turnId;
        this.store.append(session.sessionId, "turn.interrupted", {
          turnId,
          reason,
        }, { processId: process.processId, turnId });
        this.orphanInteractions(session.sessionId, process.processId, reason);
      }
      this.store.append(session.sessionId, "process.stopped", { processId: process.processId, reason }, { processId: process.processId });
    }
  }

  orphanInteractions(sessionId, processId, reason) {
    const session = this.session(sessionId);
    for (const interaction of Object.values(this.store.data.interactions)) {
      if (interaction.sessionId !== sessionId || interaction.processId !== processId || interaction.state !== INTERACTION_STATES.pending) continue;
      interaction.state = INTERACTION_STATES.orphaned;
      interaction.orphanReason = reason;
      interaction.resolvedAt = this.store.tick();
      this.store.append(sessionId, `${interaction.kind}.orphaned`, {
        interactionId: interaction.interactionId,
        providerRequestId: interaction.providerRequestId,
        reason,
      }, { turnId: interaction.turnId, processId });
      // Keep pendingInteractionId pointing at the orphaned request so the
      // browser can explain why it was not auto-resolved after a crash.
      session.pendingInteractionId = interaction.interactionId;
    }
  }

  recoverAfterRestart() {
    for (const process of Object.values(this.store.data.processes)) {
      if (process.state !== "running") continue;
      this.agentExit(process.sessionId, { reason: "backend_restart_orphan", signal: null });
    }
    return this.publicSessions();
  }

  connectBrowser({ connectionId, sessionId, lastSeenSequence = 0 }) {
    assertString(connectionId, "connection_id");
    assertString(sessionId, "session_id");
    if (this.connections.has(connectionId)) throw new RecoveryError("connection_exists");
    const session = this.session(sessionId);
    if (!Number.isInteger(lastSeenSequence) || lastSeenSequence < 0) throw new RecoveryError("invalid_sequence");
    if (lastSeenSequence > session.lastSequence) throw new RecoveryError("sequence_ahead");
    this.connections.set(connectionId, { connectionId, sessionId, connectedAt: this.store.tick() });
    return {
      connectionId,
      session: this.publicSession(sessionId),
      replay: {
        afterSequence: lastSeenSequence,
        throughSequence: session.lastSequence,
        events: this.store.sessionEvents(sessionId, lastSeenSequence),
      },
    };
  }

  disconnectBrowser(connectionId) {
    const existed = this.connections.delete(connectionId);
    return { disconnected: existed };
  }

  browserCommand(connectionId, command) {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new RecoveryError("browser_not_connected");
    assertString(command.commandId, "command_id");
    const prior = this.store.data.commands[command.commandId];
    const requestFingerprint = JSON.stringify({
      sessionId: command.sessionId,
      expectedSequence: command.expectedSequence,
      type: command.type,
      interactionId: command.interactionId ?? null,
      value: command.value ?? null,
    });
    if (prior) {
      if (prior.fingerprint !== requestFingerprint) return { status: "rejected", code: "command_reuse_conflict" };
      return { ...clone(prior.result), duplicate: true };
    }
    const session = this.session(command.sessionId);
    if (connection.sessionId !== command.sessionId) {
      return this.recordCommand(command, requestFingerprint, { status: "rejected", code: "session_mismatch" });
    }
    if (!Number.isInteger(command.expectedSequence)) {
      return this.recordCommand(command, requestFingerprint, { status: "rejected", code: "expected_sequence_required" });
    }
    if (command.expectedSequence < session.lastSequence) {
      return this.recordCommand(command, requestFingerprint, { status: "rejected", code: "stale_command", currentSequence: session.lastSequence });
    }
    if (command.expectedSequence > session.lastSequence) {
      return this.recordCommand(command, requestFingerprint, { status: "rejected", code: "future_sequence", currentSequence: session.lastSequence });
    }

    let result;
    if (command.type === "interaction.resolve") {
      result = this.resolveInteraction(session, command);
    } else if (command.type === "turn.cancel") {
      if (!session.activeTurnId) result = { status: "rejected", code: "turn_not_active" };
      else {
        session.turnState = TURN_STATES.cancelRequested;
        this.store.append(session.sessionId, "turn.cancel.requested", { turnId: session.activeTurnId }, { turnId: session.activeTurnId, source: "browser" });
        result = { status: "accepted", turnId: session.activeTurnId };
      }
    } else {
      result = { status: "rejected", code: "unknown_command" };
    }
    return this.recordCommand(command, requestFingerprint, result);
  }

  recordCommand(command, fingerprint, result) {
    this.store.data.commands[command.commandId] = {
      commandId: command.commandId,
      sessionId: command.sessionId,
      fingerprint,
      result: clone(result),
      createdAt: this.store.tick(),
    };
    return clone(result);
  }

  resolveInteraction(session, command) {
    const interaction = this.store.data.interactions[command.interactionId];
    if (!interaction || interaction.sessionId !== session.sessionId) return { status: "rejected", code: "interaction_not_found" };
    if (interaction.state !== INTERACTION_STATES.pending) return { status: "rejected", code: "interaction_not_pending" };
    if (!Array.isArray(interaction.optionIds) || !interaction.optionIds.includes(command.value)) {
      return { status: "rejected", code: "invalid_interaction_value" };
    }
    interaction.state = INTERACTION_STATES.resolved;
    interaction.resolvedAt = this.store.tick();
    session.pendingInteractionId = null;
    session.turnState = TURN_STATES.running;
    this.store.append(session.sessionId, `${interaction.kind}.resolved`, {
      interactionId: interaction.interactionId,
      providerRequestId: interaction.providerRequestId,
      value: command.value,
    }, { turnId: interaction.turnId, processId: interaction.processId, source: "browser" });
    return { status: "accepted", interactionId: interaction.interactionId };
  }

  reconcileProviderHistory(sessionId, providerHistory) {
    const session = this.session(sessionId);
    const providerIds = providerHistory.map((entry) => typeof entry === "string" ? entry : entry?.id).filter((id) => typeof id === "string");
    const localIds = historyIdsFromStore(this.store, sessionId);
    const status = relation(localIds, providerIds);
    session.historyState = status;
    const action = status === "aligned" || status === "provider_ahead"
      ? "use_provider_history_as_model_context"
      : "block_automatic_prompt_replay";
    const event = this.store.append(sessionId, "history.reconciled", {
      status,
      localHistoryIds: localIds,
      providerHistoryIds: providerIds,
      action,
    }, { source: "provider" });
    return { status, action, event };
  }

  recoverSession(sessionId, { providerHistory = [] } = {}) {
    const session = this.session(sessionId);
    if (session.state !== SESSION_STATES.orphaned && session.state !== SESSION_STATES.recoveryRequired) {
      throw new RecoveryError("session_not_orphaned");
    }
    if (!session.loadSupported && !session.resumeSupported) {
      session.state = SESSION_STATES.recoveryRequired;
      session.historyState = "unsupported";
      session.activeTurnId = null;
      const event = this.store.append(sessionId, "session.recovery.unsupported", {
        providerSessionId: session.providerSessionId,
        action: "start_new_session_or_manual_recovery",
      });
      return { status: "unsupported", event };
    }
    const process = this.startProcess(sessionId);
    let historyStatus;
    let recoveryMethod;
    if (session.loadSupported) {
      recoveryMethod = "load";
      historyStatus = this.reconcileProviderHistory(sessionId, providerHistory).status;
    } else {
      // session/resume restores provider context but deliberately does not
      // replay provider history. The local journal remains browser authority.
      recoveryMethod = "resume";
      historyStatus = "provider_resumed";
      session.historyState = historyStatus;
    }
    session.state = RECOVERABLE_HISTORY_STATES.has(historyStatus)
      ? SESSION_STATES.idle
      : SESSION_STATES.recoveryRequired;
    session.activeTurnId = null;
    const event = this.store.append(sessionId, "session.recovered", {
      providerSessionId: session.providerSessionId,
      processId: process.processId,
      recoveryMethod,
      historyStatus,
      canContinue: session.state === SESSION_STATES.idle,
      }, { processId: process.processId });
    return { status: session.state, history: historyStatus, method: recoveryMethod, event };
  }

  publicSession(sessionId) {
    const session = this.session(sessionId);
    const interaction = session.pendingInteractionId ? this.store.data.interactions[session.pendingInteractionId] : null;
    return {
      sessionId: session.sessionId,
      provider: session.provider,
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
      state: session.state,
      turnState: session.turnState,
      activeTurnId: session.activeTurnId,
      lastInterruptedTurnId: session.lastInterruptedTurnId,
      processGeneration: session.processGeneration,
      pendingInteraction: publicInteraction(interaction),
      loadSupported: session.loadSupported,
      resumeSupported: session.resumeSupported,
      historyState: session.historyState,
      lastSequence: session.lastSequence,
    };
  }

  publicSessions() {
    return Object.keys(this.store.data.sessions).sort().map((sessionId) => this.publicSession(sessionId));
  }
}
