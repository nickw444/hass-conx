# Technical Design

## 1. Overview

Home Assistant Agent is implemented as a Home Assistant app containing:

- a backend process that manages ACP agent processes and browser sessions;
- a React frontend served through Home Assistant Ingress;
- a mounted Home Assistant configuration workspace;
- persistent app-local metadata for sessions/settings;
- connectivity to an independently installed HA-MCP service.

The app does not implement model inference, a coding harness, or a Home Assistant MCP server.

## 2. Runtime topology

```mermaid
flowchart LR
    User[Browser] -->|HA Ingress| Gateway[HA Agent HTTP/WebSocket Server]
    Gateway --> Store[(App Data)]
    Gateway --> Manager[Agent Session Manager]
    Manager --> ACPClient[ACP Client]

    ACPClient -->|stdio| CodexACP[codex-acp]
    ACPClient -->|stdio| CursorACP[cursor agent acp]
    ACPClient -->|stdio| CustomACP[custom ACP agent]

    CodexACP -->|filesystem| Config[/homeassistant]
    CursorACP -->|filesystem| Config
    CustomACP -->|filesystem| Config

    CodexACP -->|HTTP MCP| HAMCP[HA-MCP]
    CursorACP -->|HTTP MCP| HAMCP
    CustomACP -->|HTTP MCP| HAMCP

    HAMCP --> HACore[Home Assistant Core]
```

## 3. Home Assistant app packaging

### Required app capabilities

The app needs:

- Home Assistant Ingress enabled;
- WebSocket support through the app web server;
- read/write `homeassistant_config` mapping;
- persistent `/data` storage;
- outbound/local network access sufficient to connect to HA-MCP;
- Node.js runtime if using the ACP TypeScript SDK and `codex-acp` npm package.

Conceptual app mapping:

```yaml
map:
  - type: homeassistant_config
    read_only: false
    path: /homeassistant
```

Exact app manifest syntax should be validated against current Home Assistant app schema during implementation.

### Filesystem paths

| Path | Purpose |
|---|---|
| `/homeassistant` | mounted HA config workspace exposed to agents |
| `/data` | app settings, provider metadata, UI/session metadata |
| `/tmp` | ephemeral per-turn files, image uploads, generated schemas |

Provider authentication state may live in provider-specific config homes under `/data/providers/<provider>/` rather than the container's default home directory.

## 4. Process model

### Backend process

One long-running application process owns:

- HTTP/Ingress frontend serving;
- browser WebSocket connections;
- ACP agent process lifecycle;
- session registry;
- provider authentication coordination;
- normalization of ACP events for the frontend.

### Agent processes

Recommended initial model: **one ACP agent process per active provider account**, with multiple sessions multiplexed if the agent supports it reliably.

Fallback model: one process per active session.

The implementation should isolate process management behind an internal `AgentRuntime` abstraction so the process strategy can change without frontend impact.

### Failure behavior

If an agent process exits:

- mark sessions attached to that process as disconnected;
- preserve durable session metadata;
- automatically restart the provider runtime when safe;
- offer Resume in the UI;
- do not discard pending user-visible events.

## 5. ACP client responsibilities

The backend ACP client handles:

- initialization and capability negotiation;
- authentication requests;
- session creation/loading;
- user prompt submission;
- streamed session updates;
- permission requests and responses;
- cancellation;
- MCP server injection at session creation;
- provider mode/model selection where exposed through ACP.

The backend should preserve raw ACP messages in debug logs but expose a normalized frontend event stream.

## 6. Session creation

Conceptually:

```text
createSession(
  cwd = /homeassistant,
  mcpServers = [home-assistant -> HA-MCP endpoint],
  provider = selected ACP runtime,
  mode = selected permission profile
)
```

### Injected MCP server

The HA-MCP endpoint should be supplied programmatically for each session rather than relying on a user's provider-global configuration.

Benefits:

- deterministic behavior;
- no manual `.codex/config.toml` or Cursor configuration;
- easy replacement/rotation of the HA-MCP secret URL;
- custom provider sessions inherit the same Home Assistant capability layer.

## 7. HA-MCP discovery/configuration

MVP options, in preferred order:

1. **Explicit URL in app configuration** — simplest and most deterministic.
2. Optional guided discovery of a known HA-MCP app/service on the internal app network.
3. Future integration-based discovery if HA-MCP exposes a stable local endpoint contract.

The app should perform a health/capability check on startup and show a clear degraded state if HA-MCP is unavailable.

## 8. Frontend/backend transport

Use one WebSocket connection per browser tab.

### Browser messages

- create/resume session;
- send prompt;
- cancel turn;
- resolve permission request;
- update provider/session settings;
- fetch session history;
- request expanded raw event details.

### Server events

See `09-frontend-event-contract.md`.

The transport should support replay from a sequence number so transient browser reconnects do not lose streamed activity.

## 9. Persistence

### Persist in `/data`

- configured providers;
- non-secret provider metadata;
- references to provider auth state;
- session IDs and titles;
- session-to-provider mapping;
- UI preferences;
- HA-MCP endpoint configuration;
- event summaries needed to reconstruct recent conversations if the provider cannot supply full history.

### Do not persist unnecessarily

- raw Home Assistant secrets;
- HA-MCP tool outputs containing sensitive state unless needed for session history;
- full terminal output forever;
- duplicated copies of Home Assistant config files.

## 10. Conversation history source of truth

Preferred:

- ACP provider's session/thread history is authoritative for agent context;
- our app persists display metadata and normalized activity summaries.

If a provider cannot reconstruct history adequately, maintain an app-side transcript for UI reconstruction, but avoid replaying it into the agent unless required.

## 11. Config editing model

The agent writes directly to `/homeassistant` using its native filesystem tools.

The app does not proxy individual file writes.

Instead it observes:

- ACP file-change events where available;
- optional git/directory snapshots for independent verification;
- post-turn filesystem checks for changed files as a fallback.

### Optional git strategy

Future enhancement:

- initialize/use an existing Git repository in `/homeassistant`;
- capture `git diff` before/after a turn;
- offer checkpoint/commit operations;
- never auto-push.

This should not be an MVP requirement because many HA installations are not Git-managed.

## 12. Validation and reloads

Do not duplicate Home Assistant validation logic in our backend.

Preferred order:

1. Agent uses HA-MCP's supported system/config tools where appropriate.
2. Agent may use local commands only if they are valid in the app environment.
3. UI renders validation/reload/restart results as Home Assistant-specific cards.

## 13. Dependency boundaries

### Hard dependencies

- Home Assistant app runtime / Ingress.
- ACP client library.
- At least one ACP-capable agent implementation.

### Recommended external dependency

- HA-MCP.

The product can technically run without HA-MCP as a filesystem-only coding agent, but the UI should clearly mark that Home Assistant live tools are unavailable.

## 14. Upgrade strategy

Provider runtimes should be independently versionable where practical.

For the bundled Codex path:

- pin a known-good `codex-acp` version per app release;
- allow an advanced channel to track newer versions;
- expose runtime version in diagnostics.

Avoid silently floating major agent runtime versions in stable releases.

## 15. Observability

Expose a diagnostics page containing:

- app version;
- ACP client version;
- provider executable/version;
- authentication state;
- HA-MCP endpoint health;
- HA-MCP server version if discoverable;
- active session count;
- last runtime error;
- filesystem mount status;
- relevant logs with secrets redacted.

## 16. References

- Home Assistant app docs: <https://developers.home-assistant.io/docs/apps/>
- App presentation / Ingress: <https://developers.home-assistant.io/docs/apps/presentation/>
- HA-MCP: <https://github.com/homeassistant-ai/ha-mcp>
- Codex App Server: <https://github.com/openai/codex/tree/main/codex-rs/app-server>
- Codex ACP: <https://github.com/agentclientprotocol/codex-acp>
- ACP: <https://agentclientprotocol.com/>
