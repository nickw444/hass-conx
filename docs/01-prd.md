# Product Requirements Document

## 1. Product overview

**Working name:** Hass-Conx

Hass-Conx is a conversational development and diagnostics interface for Home Assistant. It connects a user-selected coding agent to a Home Assistant configuration workspace and to live Home Assistant runtime tools supplied by HA-MCP.

The same application must run in two modes:

1. **Home Assistant app mode** — embedded via Ingress with direct access to the HA config mount.
2. **Local development mode** — run directly or in Docker on a developer workstation, with configurable local workspace/data paths and HA-MCP reached over the network.

The product must feel substantially simpler than a generic coding-agent workbench while retaining the power of a real coding agent underneath.

## 2. Goals

### Primary goals

- Give users a conversational way to inspect, debug, and modify Home Assistant.
- Reuse existing high-quality agent runtimes instead of building a new harness.
- Allow multiple agent providers through ACP.
- Expose Home Assistant runtime context through HA-MCP rather than duplicating its API/tool surface.
- Use the existing HA-MCP Webhook Proxy app and standard MCP OAuth for network access.
- Give users explicit visibility into reads, tool calls, commands, diffs, and writes.
- Make potentially dangerous actions understandable and controllable.
- Run naturally as a Home Assistant app via Ingress.
- Support a fast local dev loop without requiring an app rebuild/install for every change.

### Secondary goals

- Support mobile/tablet usage for diagnosis and small changes.
- Support power users without forcing the UI to look like an IDE.
- Preserve enough raw technical detail for troubleshooting.
- Make agent sessions resumable.
- Allow the ecosystem to evolve toward more ACP-native providers over time.

## 3. Non-goals

The first versions will not attempt to:

- replace the full Home Assistant frontend;
- replace VS Code for large refactors;
- provide arbitrary remote shell access to users;
- implement its own model inference layer;
- implement its own Home Assistant MCP server;
- implement its own MCP OAuth server;
- provide a general-purpose multi-repository coding environment;
- guarantee safe autonomous control of physical devices;
- expose every underlying ACP or Codex feature in the UI.

## 4. Target users

### Primary: technically confident Home Assistant power user

Maintains YAML, templates, dashboards, automations, or custom integrations; understands configuration risk; wants the agent to inspect both source and live runtime state; values transparency, diffs and traces.

### Secondary: advanced Home Assistant user

May not use an IDE regularly, but wants help debugging automations and making simple configuration changes with strong defaults.

### Developer/contributor

Needs to run Hass-Conx locally against a real Home Assistant instance, use hot reload, use a safe fixture workspace by default, and only package/install the HA app when testing deployment-specific behavior.

## 5. Jobs to be done

- **Diagnose runtime behavior:** "Why didn't this automation fire last night?"
- **Make a safe configuration change:** "Change the hallway light threshold to 25 lux."
- **Understand an object:** "What is `sensor.foo_bar` and what device/integration owns it?"
- **Create an automation:** "When the garage opens after sunset, turn on the garage lights for ten minutes."
- **Investigate system problems:** "What is causing these Home Assistant errors?"
- **Review maintenance opportunities:** "Find stale automations and entities, but do not delete anything."

## 6. Core product requirements

### P0 — Conversation

- Create a new agent session.
- Send text prompts and stream responses.
- Resume sessions after closing the UI.
- Interrupt/cancel a running turn.

### P0 — Agent provider

- Codex supported first via `codex-acp`.
- Authentication uses the supported Codex/ChatGPT flow.
- Provider/model status visible in settings.
- Frontend is not coupled to Codex-specific events.

### P0 — Workspace/config access

- Backend accepts a configurable workspace path.
- In HA app mode the default is `/homeassistant` mapped from `homeassistant_config`.
- In local mode the workspace is supplied by configuration/env.
- File changes are surfaced as structured activity and inspectable diffs.
- A safe fixture workspace is provided for local development/tests.

### P0 — Live Home Assistant capabilities

Through HA-MCP the agent can, at minimum:

- search/list entities;
- retrieve current state;
- inspect entity/device/area metadata;
- retrieve automation configuration and traces;
- inspect history/logbook;
- inspect logs/system health.

### P0 — HA-MCP connectivity and OAuth

- Canonical endpoint is the **Webhook Proxy for HA-MCP** public webhook URL.
- Webhook Proxy is configured with OAuth enabled and `ha_auth` mode.
- Hass-Conx injects the HTTP MCP endpoint into each ACP session.
- The agent runtime performs the standard MCP OAuth flow; Hass-Conx presents any required authorization interaction to the user but does not implement a bespoke Home Assistant auth protocol.
- The same endpoint works from the HA app and from a developer workstation.
- Direct/private HA-MCP URLs may be supported only as an advanced/dev fallback.

### P0 — Permissions

- Surface ACP/provider permission requests.
- Support at least Reject and Allow Once.
- Clearly distinguish requested vs already-applied operations.

### P0 — Home Assistant app integration

- Available through Home Assistant sidebar / Ingress.
- Browser does not separately authenticate in app mode.
- WebSocket streaming works through Ingress.
- App restart does not corrupt session metadata.

### P0 — Local development

- `npm run dev` starts backend and frontend outside Home Assistant.
- Local mode requires no Supervisor APIs.
- HA URL/MCP endpoint, workspace path and data path are ordinary configuration.
- Docker local mode is available for parity with production packaging.
- Vite/backend hot reload is supported for ordinary UI/backend work.

### P1 — Rich Home Assistant rendering

- Entity/state cards.
- Automation trace summaries.
- File diff cards.
- Compact command/tool activity cards.

### P1 — Provider abstraction

- Cursor ACP can be added without frontend changes.
- Backend can enumerate configured ACP providers.
- Provider-specific auth/settings remain behind ACP/provider integration.

### P1 — Session UX

- Recent sessions.
- Generated title.
- Rename/archive/delete.
- Provider/model metadata.

## 7. UX principles

- **Home Assistant first:** prefer HA concepts over generic coding-workbench terminology.
- **Progressive disclosure:** show concise activity with expandable raw details.
- **State the side effect:** make reads, writes, service calls and failures obvious.
- **Do not lie about approval timing:** an applied patch must never look merely proposed.
- **Keep dev mode visually identifiable:** local/dev builds should show a small non-production indicator.

## 8. Success criteria

For an initial technical preview:

- ≥95% of sessions successfully initialize Codex and HA-MCP.
- The same core acceptance flows work in local mode and HA app mode.
- A developer can change frontend/backend code and exercise it against live HA without rebuilding the HA app.
- Permission requests are never silently dropped.
- A file mutation is always observable as a file-change event or post-turn summary.
- UI remains usable on desktop and tablet widths.

## 9. Acceptance workflows

### Workflow A — state lookup

Prompt: "Find my living room lights and tell me which are currently on."

Expected: HA-MCP call visible, current state returned, friendly entity rendering.

### Workflow B — automation diagnosis

Prompt: "Why didn't the hallway lights turn on last night?"

Expected: config plus trace/history inspected; failed condition/action identifiable.

### Workflow C — file edit

Prompt: "Change this threshold from 10 to 20."

Expected: correct workspace file edited, exact diff shown, validation/reload advice provided.

### Workflow D — local development parity

Run Hass-Conx locally with a fixture workspace and live HA-MCP URL. Complete workflows A and C without Home Assistant Ingress or Supervisor.

### Workflow E — packaged parity

Install the Home Assistant app, mount `/homeassistant`, use the same HA-MCP webhook URL, and complete workflows A-C through Ingress.
