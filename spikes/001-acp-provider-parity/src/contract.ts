import type { SessionNotification, SessionUpdate, StopReason } from "@agentclientprotocol/sdk";

/**
 * A deliberately small application-owned projection of ACP.  It is the
 * boundary a browser/store can persist and replay; raw ACP remains diagnostic
 * metadata and is never the browser source of truth.
 */
export type NormalizedKind =
  | "message.delta"
  | "thought.delta"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "file.changed"
  | "plan.updated"
  | "terminal.started"
  | "terminal.output"
  | "terminal.completed"
  | "permission.requested"
  | "permission.resolved"
  | "elicitation.requested"
  | "elicitation.resolved"
  | "turn.state"
  | "session.capabilities"
  | "activity.unknown"
  | "error";

export type NormalizedEvent = {
  sequence: number;
  sessionId: string;
  kind: NormalizedKind;
  /** Stable, UI-safe fields. Provider-specific details belong in rawMeta. */
  data: Record<string, unknown>;
  /** Redacted raw details retained only for diagnostics/replay investigations. */
  rawMeta?: Record<string, unknown>;
};

const textOf = (content: unknown): string | undefined => {
  if (!content || typeof content !== "object") return undefined;
  const value = content as { type?: unknown; text?: unknown };
  return value.type === "text" && typeof value.text === "string" ? value.text : undefined;
};

const statusKind = (status: unknown): NormalizedKind => {
  if (status === "completed" || status === "failed") return "tool.completed";
  if (status === "in_progress" || status === "pending") return "tool.started";
  return "tool.updated";
};

/** Map a typed ACP session/update notification into the provider-neutral event. */
export function normalizeSessionUpdate(notification: SessionNotification, sequence: number): NormalizedEvent {
  const update = notification.update as SessionUpdate & Record<string, unknown>;
  const sessionId = notification.sessionId;
  const base = { sequence, sessionId };

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "user_message_chunk":
      return {
        ...base,
        kind: "message.delta",
        data: { role: update.sessionUpdate === "agent_message_chunk" ? "assistant" : "user", text: textOf(update.content) ?? "", messageId: update.messageId ?? null },
      };
    case "agent_thought_chunk":
      return { ...base, kind: "thought.delta", data: { text: textOf(update.content) ?? "", messageId: update.messageId ?? null } };
    case "tool_call":
      return {
        ...base,
        kind: statusKind(update.status),
        data: { toolCallId: update.toolCallId, title: update.title, name: update.name ?? null, kind: update.kind ?? null, status: update.status ?? null, locations: update.locations ?? [] },
        rawMeta: { rawInput: update.rawInput ?? null, rawOutput: update.rawOutput ?? null },
      };
    case "tool_call_update":
      return {
        ...base,
        kind: statusKind(update.status),
        data: { toolCallId: update.toolCallId, status: update.status ?? null, title: update.title ?? null, locations: update.locations ?? [] },
        rawMeta: { rawInput: update.rawInput ?? null, rawOutput: update.rawOutput ?? null },
      };
    case "plan":
    case "plan_update":
    case "plan_removed":
      return { ...base, kind: "plan.updated", data: { updateType: update.sessionUpdate, entries: update.entries ?? update.plan ?? null } };
    default:
      return { ...base, kind: "activity.unknown", data: { updateType: update.sessionUpdate }, rawMeta: { update } };
  }
}

export function normalizeTurnState(sessionId: string, sequence: number, state: string, stopReason?: StopReason): NormalizedEvent {
  return { sequence, sessionId, kind: "turn.state", data: { state, stopReason: stopReason ?? null } };
}

/** A tool edit's locations become a separate file activity in the UI projection. */
export function deriveFileChange(notification: SessionNotification, sequence: number): NormalizedEvent | undefined {
  const update = notification.update as SessionUpdate & Record<string, unknown>;
  if ((update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") || update.kind !== "edit" || !Array.isArray(update.locations) || update.locations.length === 0) return undefined;
  return {
    sequence,
    sessionId: notification.sessionId,
    kind: "file.changed",
    data: { toolCallId: update.toolCallId, locations: update.locations, status: update.status ?? null },
  };
}

export function normalizeTerminal(sessionId: string, sequence: number, phase: "started" | "output" | "completed", data: Record<string, unknown>): NormalizedEvent {
  return { sequence, sessionId, kind: `terminal.${phase}`, data };
}

export function normalizePermission(sessionId: string, sequence: number, requested: boolean, details: Record<string, unknown>): NormalizedEvent {
  return {
    sequence,
    sessionId,
    kind: requested ? "permission.requested" : "permission.resolved",
    data: details,
  };
}

/** Never retain obvious credential material in raw metadata or traces. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/(api[_-]?key|auth[_-]?token|access[_-]?token|password|secret)(\s*[:=]\s*)[^\s,;}]+/gi, "$1$2[REDACTED]")
      .replace(/https?:\/\/[^\s]*([?&](?:token|key|secret|access_token)=[^&\s]*)[^\s]*/gi, "[REDACTED_URL]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:api[_-]?key|auth[_-]?token|access[_-]?token|password|secret|authorization)$/i.test(key)) result[key] = "[REDACTED]";
      else result[key] = redact(child);
    }
    return result;
  }
  return value;
}
