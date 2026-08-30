# Frontend Event Contract

## 1. Purpose

Define a stable application-level event stream between the Home Assistant Agent backend and browser.

The browser should not consume ACP wire messages directly.

Benefits:

- shields UI from ACP protocol/version changes;
- supports multiple agent providers;
- allows HA-specific enrichment;
- enables replay after browser reconnect;
- provides one place for secret redaction.

## 2. Envelope

Conceptual TypeScript:

```ts
interface UiEvent<T = unknown> {
  seq: number;
  sessionId: string;
  turnId?: string;
  timestamp: string;
  type: UiEventType;
  payload: T;
}
```

`seq` is monotonically increasing within a session and used for replay.

## 3. Event types

```ts
type UiEventType =
  | "session.status"
  | "turn.status"
  | "message.user"
  | "message.agent.delta"
  | "message.agent.completed"
  | "plan.updated"
  | "reasoning.summary"
  | "command.started"
  | "command.output"
  | "command.completed"
  | "file_change.started"
  | "file_change.completed"
  | "mcp_call.started"
  | "mcp_call.completed"
  | "permission.requested"
  | "permission.resolved"
  | "error";
```

Additional event types can be added without breaking old clients.

## 4. Session status

```ts
interface SessionStatusPayload {
  status:
    | "starting"
    | "ready"
    | "running"
    | "waiting_for_permission"
    | "disconnected"
    | "failed";
  provider: string;
  model?: string;
  detail?: string;
}
```

## 5. Turn status

```ts
interface TurnStatusPayload {
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
```

## 6. Messages

### User

```ts
interface UserMessagePayload {
  messageId: string;
  text: string;
}
```

### Agent delta

```ts
interface AgentMessageDeltaPayload {
  messageId: string;
  delta: string;
}
```

### Agent completed

```ts
interface AgentMessageCompletedPayload {
  messageId: string;
  text: string;
}
```

The backend may reconstruct deltas from provider-specific events where needed.

## 7. Plan/reasoning summaries

```ts
interface PlanPayload {
  items: Array<{
    text: string;
    status?: "pending" | "active" | "completed";
  }>;
}

interface ReasoningSummaryPayload {
  text: string;
}
```

Only provider-supplied user-visible summaries are allowed. Do not expose private hidden reasoning.

## 8. Command events

```ts
interface CommandStartedPayload {
  callId: string;
  command: string;
  cwd?: string;
}

interface CommandOutputPayload {
  callId: string;
  stream: "stdout" | "stderr";
  delta: string;
}

interface CommandCompletedPayload {
  callId: string;
  exitCode?: number;
  status: "completed" | "failed" | "cancelled";
  durationMs?: number;
}
```

Sensitive values should be redacted before emission.

## 9. File change events

```ts
interface FileChangePayload {
  changeId: string;
  status: "proposed" | "applying" | "applied" | "failed";
  files: Array<{
    path: string;
    kind: "add" | "update" | "delete";
    diff?: string;
  }>;
}
```

`proposed` must only be used when the change has not yet occurred.

## 10. MCP call events

```ts
interface McpCallStartedPayload {
  callId: string;
  server: string;
  tool: string;
  arguments?: unknown;
  presentation?: ToolPresentation;
}

interface McpCallCompletedPayload {
  callId: string;
  server: string;
  tool: string;
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
  presentation?: ToolPresentation;
}
```

### Tool presentation

```ts
interface ToolPresentation {
  category?:
    | "entity"
    | "automation_trace"
    | "history"
    | "service"
    | "config"
    | "system"
    | "generic";
  title?: string;
  summary?: string;
  structured?: unknown;
}
```

The backend enrichment layer can transform known HA-MCP tool output into `structured` presentation data while preserving the raw result for debugging.

## 11. Permission events

```ts
interface PermissionRequestedPayload {
  requestId: string;
  provider: string;
  category: "filesystem" | "command" | "mcp" | "network" | "other";
  title: string;
  description?: string;
  options: Array<{
    id: string;
    label: string;
    style?: "primary" | "danger" | "neutral";
  }>;
  details?: unknown;
}
```

Browser responds with:

```ts
interface ResolvePermissionCommand {
  requestId: string;
  optionId: string;
}
```

Backend emits:

```ts
interface PermissionResolvedPayload {
  requestId: string;
  optionId: string;
}
```

## 12. Error event

```ts
interface ErrorPayload {
  scope: "session" | "turn" | "provider" | "ha_mcp" | "transport";
  code?: string;
  message: string;
  recoverable: boolean;
  detailsAvailable?: boolean;
}
```

Do not send credential-bearing raw errors to the frontend.

## 13. Replay/reconnect

Browser sends last seen sequence number:

```json
{
  "type": "session.subscribe",
  "sessionId": "...",
  "afterSeq": 123
}
```

Backend replays persisted/recent buffered events after `123`, then continues live streaming.

For very old sessions, backend may send a materialized snapshot followed by new events rather than replay every historical delta.

## 14. Backend normalization rules

- Every provider event maps to zero or more UI events.
- Unknown provider events are logged, not blindly forwarded.
- Secret-bearing values are removed before browser emission.
- Raw tool arguments/results may be withheld from default payload and fetched through an explicit diagnostics endpoint.
- Tool enrichment must never alter the actual provider result used by the agent.

## 15. HA-MCP enrichment examples

### Entity lookup

Normalized structured data:

```json
{
  "entityId": "light.living_room",
  "name": "Living Room",
  "state": "on",
  "attributes": {
    "brightness": 165
  },
  "area": "Living Room"
}
```

### Automation trace

```json
{
  "automationId": "automation.hallway",
  "runId": "...",
  "startedAt": "...",
  "steps": [
    {"label": "Motion detected", "status": "passed"},
    {"label": "Sun below horizon", "status": "passed"},
    {
      "label": "Illuminance below 15 lx",
      "status": "failed",
      "actual": "21.4 lx"
    }
  ],
  "stoppedAt": 2
}
```

## 16. Versioning

Expose protocol version during WebSocket initialization:

```json
{
  "uiProtocolVersion": 1
}
```

Prefer additive changes. If a breaking change is unavoidable, negotiate major versions rather than guessing on the client.
