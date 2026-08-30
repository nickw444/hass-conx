import type { SessionNotification, SessionUpdate } from "@agentclientprotocol/sdk";

export type FidelityKind =
  | "message.delta"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "permission.requested"
  | "permission.resolved"
  | "terminal.started"
  | "terminal.output"
  | "terminal.completed"
  | "file.changed"
  | "activity.unknown";

export type FidelityEvent = {
  sequence: number;
  sessionId: string;
  kind: FidelityKind;
  data: Record<string, unknown>;
  source: "acp.session.update" | "acp.client.rpc" | "external.snapshot";
};

function statusKind(status: unknown): FidelityKind {
  if (status === "completed" || status === "failed") return "tool.completed";
  if (status === "pending" || status === "in_progress") return "tool.started";
  return "tool.updated";
}

function textOf(content: unknown): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const value = content as { type?: unknown; text?: unknown };
  return value.type === "text" && typeof value.text === "string" ? value.text : undefined;
}

/** Map only ACP session/update notifications. Client RPC observations are separate. */
export function normalizeUpdate(notification: SessionNotification, sequence: number): FidelityEvent {
  const update = notification.update as SessionUpdate & Record<string, unknown>;
  const base = { sequence, sessionId: notification.sessionId, source: "acp.session.update" as const };
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "user_message_chunk":
      return {
        ...base,
        kind: "message.delta",
        data: {
          role: update.sessionUpdate === "agent_message_chunk" ? "assistant" : "user",
          text: textOf(update.content) ?? "",
          messageId: update.messageId ?? null,
        },
      };
    case "tool_call":
      return {
        ...base,
        kind: statusKind(update.status),
        data: {
          toolCallId: update.toolCallId,
          title: update.title,
          kind: update.kind ?? "other",
          status: update.status ?? "pending",
          locations: update.locations ?? [],
          contentTypes: Array.isArray(update.content) ? update.content.map((item: any) => item?.type ?? "unknown") : [],
          rawInput: update.rawInput ?? null,
          rawOutput: update.rawOutput ?? null,
        },
      };
    case "tool_call_update":
      return {
        ...base,
        kind: statusKind(update.status),
        data: {
          toolCallId: update.toolCallId,
          title: update.title ?? null,
          status: update.status ?? null,
          locations: update.locations ?? [],
          contentTypes: Array.isArray(update.content) ? update.content.map((item: any) => item?.type ?? "unknown") : [],
          rawInput: update.rawInput ?? null,
          rawOutput: update.rawOutput ?? null,
        },
      };
    default:
      return {
        ...base,
        kind: "activity.unknown",
        data: { updateType: update.sessionUpdate, raw: update },
      };
  }
}

export function rpcEvent(
  sequence: number,
  sessionId: string,
  method: string,
  data: Record<string, unknown>,
): FidelityEvent {
  const kind: FidelityKind = method === "fs/write_text_file"
    ? "file.changed"
    : method === "fs/read_text_file"
      ? "activity.unknown"
    : method === "terminal/create"
      ? "terminal.started"
      : method === "terminal/output"
        ? "terminal.output"
        : method === "terminal/release" || method === "terminal/wait_for_exit"
          ? "terminal.completed"
          : "activity.unknown";
  return { sequence, sessionId, kind, data: { method, ...data }, source: "acp.client.rpc" };
}

export function permissionEvent(
  sequence: number,
  sessionId: string,
  resolved: boolean,
  data: Record<string, unknown>,
): FidelityEvent {
  return {
    sequence,
    sessionId,
    kind: resolved ? "permission.resolved" : "permission.requested",
    data,
    source: "acp.client.rpc",
  };
}

export function snapshotEvent(
  sequence: number,
  sessionId: string,
  data: Record<string, unknown>,
): FidelityEvent {
  return { sequence, sessionId, kind: "file.changed", data, source: "external.snapshot" };
}

/** Keep traces useful without allowing accidental credentials into artifacts. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/(api[_-]?key|auth[_-]?token|access[_-]?token|password|secret|authorization)(\s*[:=]\s*)[^\s,;}]+/gi, "$1$2[REDACTED]")
      .replace(/https?:\/\/[^\s]*([?&](?:token|key|secret|access_token)=[^&\s]*)[^\s]*/gi, "[REDACTED_URL]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = /^(?:api[_-]?key|auth[_-]?token|access[_-]?token|password|secret|authorization)$/i.test(key)
        ? "[REDACTED]"
        : redact(child);
    }
    return output;
  }
  return value;
}

export function canonicalize(value: unknown, workspace: string): unknown {
  if (typeof value === "string") return value.split(workspace).join("<workspace>").replace(/http:\/\/127\.0\.0\.1:\d+\/mcp/g, "http://127.0.0.1:<port>/mcp");
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, workspace));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) output[key] = canonicalize(child, workspace);
    return output;
  }
  return value;
}
