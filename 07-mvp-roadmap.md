# MVP Delivery Plan

## 1. Delivery strategy

Build the smallest vertical slice that proves the architecture before investing in specialized UI.

The critical hypothesis is:

> An ACP client running in a Home Assistant app can launch Codex via `codex-acp`, root it at `/homeassistant`, inject HA-MCP as an HTTP MCP server, and stream rich events through Home Assistant Ingress reliably.

Everything else follows from that.

## 2. Phase 0 — research spikes

### Spike A — Codex ACP + HA-MCP interoperability

Goal: prove the core runtime path outside Home Assistant first.

Run:

```text
ACP test client
  -> codex-acp
     -> Codex App Server
        -> HA-MCP HTTP endpoint
```

Acceptance:

- authenticate using ChatGPT account;
- create session;
- inject HA-MCP;
- `list/find lights` works;
- retrieve an automation trace;
- MCP events stream back through ACP;
- no zero-tool HTTP MCP initialization bug.

### Spike B — filesystem workspace

Run Codex session with a disposable HA config fixture as cwd.

Acceptance:

- read file;
- change YAML;
- capture file-change event;
- inspect resulting diff;
- reject a permission request where applicable.

### Spike C — Home Assistant Ingress WebSocket

Minimal app with frontend and backend WebSocket.

Acceptance:

- authenticated sidebar access;
- bidirectional streaming;
- reconnect after page refresh;
- no special external port required.

## 3. Phase 1 — backend MVP

### Suggested PR 1 — app skeleton

- HA app manifest/config;
- Node backend;
- React placeholder frontend;
- `/homeassistant` mount;
- `/data` persistence;
- Ingress routing;
- health endpoint.

### Suggested PR 2 — ACP runtime manager

- spawn `codex-acp`;
- ACP initialize handshake;
- runtime lifecycle;
- debug logging;
- process restart behavior.

### Suggested PR 3 — Codex authentication

- render advertised auth methods;
- ChatGPT auth flow;
- auth state persistence;
- connected/disconnected UI.

### Suggested PR 4 — sessions and prompts

- create session;
- cwd `/homeassistant`;
- send prompt;
- stream agent messages;
- cancel turn;
- basic session persistence.

### Suggested PR 5 — HA-MCP injection

- app setting for HA-MCP URL;
- secret storage/redaction;
- connection test;
- inject HTTP MCP server into new session;
- degraded mode when unavailable.

## 4. Phase 2 — generic agent UI

### Suggested PR 6 — normalized event stream

Implement event contract from `09-frontend-event-contract.md`.

Support:

- agent message;
- reasoning/plan summary;
- command;
- file change;
- MCP call;
- error;
- turn state.

### Suggested PR 7 — permission UX

- backend request correlation;
- Reject;
- Allow once;
- waiting state;
- cancellation during pending approval.

### Suggested PR 8 — session list/history

- recent sessions;
- resume;
- rename;
- archive/remove;
- provider badge/status.

## 5. Phase 3 — Home Assistant-specific UX

### Suggested PR 9 — entity/state renderer

Recognize common HA-MCP entity/state responses and render friendly cards.

### Suggested PR 10 — automation trace renderer

- latest trace summary;
- condition/action status;
- stop reason;
- expandable raw trace.

### Suggested PR 11 — file diff experience

- syntax-aware unified diff;
- changed-file summary;
- link/open raw file context;
- distinguish applied vs proposed changes.

### Suggested PR 12 — diagnostics/settings

- provider version;
- auth state;
- HA-MCP status;
- config mount status;
- app logs;
- capability profile.

## 6. Phase 4 — provider-neutral validation

### Cursor smoke test

Add Cursor as a second provider through native ACP.

Acceptance:

- launch Cursor ACP process;
- authenticate;
- inject same HA-MCP server;
- use same frontend/event pipeline;
- complete state lookup + file read workflow.

This is the point where we can credibly state the architecture is agent-agnostic.

## 7. MVP feature cut

### Must ship

- Home Assistant Ingress UI;
- Codex provider;
- ChatGPT authentication;
- conversation/session resume;
- `/config` read/write;
- HA-MCP HTTP integration;
- text streaming;
- MCP activity;
- command activity;
- file-change activity;
- permission requests;
- basic entity and trace rendering;
- diagnostics.

### Can defer

- Cursor UI support;
- arbitrary custom ACP provider config;
- attachments/images;
- full Home Assistant service-call UI cards;
- git integration;
- branch/fork sessions;
- multiple concurrent running turns;
- subagent visualization;
- voice integration;
- mobile app-specific features.

## 8. End-to-end acceptance suite

### Test 1 — filesystem read

Prompt:

> "Read configuration.yaml and summarize its top-level sections."

Pass:

- file read succeeds;
- response streams;
- activity visible.

### Test 2 — HA live state

Prompt:

> "Find the living room lights and tell me which are on."

Pass:

- HA-MCP used;
- current state returned;
- entity renderer displayed.

### Test 3 — automation trace

Prompt:

> "Show me why automation X didn't run successfully last time."

Pass:

- trace retrieved;
- failed/stopped step identifiable;
- trace card rendered.

### Test 4 — config mutation

Prompt:

> "Change threshold X from 10 to 20."

Pass:

- permission workflow honored;
- correct file changed;
- diff visible;
- no unrelated changes.

### Test 5 — combined diagnosis

Prompt:

> "This automation's YAML looks right. Check live traces and fix the actual issue."

Pass:

- both filesystem and HA-MCP used;
- final answer cites runtime evidence;
- any write is visible.

## 9. Testing strategy

### Unit

- ACP event normalization;
- secret redaction;
- session persistence;
- permission correlation;
- HA-MCP renderer parsing.

### Integration

- fake ACP agent fixture;
- fake HA-MCP server;
- real `codex-acp` smoke test gated by credentials;
- browser WebSocket reconnect.

### Home Assistant app e2e

- install app in test HA instance;
- verify Ingress;
- verify config mount;
- connect to HA-MCP;
- complete a scripted conversation.

## 10. Release progression

### 0.1 — technical preview

Codex only, advanced users, manual HA-MCP URL.

### 0.2 — usable alpha

Specialized HA renderers, stronger diagnostics, settings improvements.

### 0.3 — provider-neutral alpha

Cursor ACP support and provider abstraction validation.

### 0.5 — beta

Hardening, migration handling, permissions review, responsive UI.

### 1.0

Stable provider/runtime pins, documented HA-MCP deployment, tested upgrade/recovery behavior.
