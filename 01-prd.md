# Product Requirements Document

## 1. Product overview

**Working name:** Home Assistant Agent

Home Assistant Agent is a conversational development and diagnostics interface embedded in Home Assistant. It connects a user-selected coding agent to the user's Home Assistant configuration workspace and live Home Assistant runtime tools.

The product must feel substantially simpler than a generic coding-agent workbench while retaining the power of a real coding agent underneath.

## 2. Goals

### Primary goals

- Give users a conversational way to inspect, debug, and modify Home Assistant.
- Reuse existing high-quality agent runtimes instead of building a new harness.
- Allow multiple agent providers through a provider-neutral protocol.
- Expose Home Assistant runtime context through HA-MCP rather than duplicating its API/tool surface.
- Give users explicit visibility into reads, tool calls, commands, diffs, and writes.
- Make potentially dangerous actions understandable and controllable.
- Run naturally as a Home Assistant app via Ingress.

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
- implement its own MCP server for Home Assistant;
- provide a general-purpose multi-repository coding environment;
- guarantee safe autonomous control of physical devices;
- expose every underlying ACP or Codex feature in the UI.

## 4. Target users

### Primary: technically confident Home Assistant power user

Characteristics:

- maintains YAML, templates, dashboards, automations, or custom integrations;
- understands that configuration changes can break Home Assistant;
- wants an agent to inspect both source and live runtime state;
- values transparency, diffs, traces, and reproducibility.

### Secondary: advanced Home Assistant user

Characteristics:

- may not use an IDE regularly;
- wants help debugging automations and editing simple configuration;
- benefits from a simplified UI and strong defaults.

### Future: Home Assistant developers / maintainers

Potential use cases include integration development, code reviews, diagnostics, and support workflows, but these are not the MVP focus.

## 5. Jobs to be done

### Diagnose runtime behavior

> "Why didn't this automation fire last night?"

The agent should inspect configuration, traces, relevant entity history, and logs, then explain the likely cause.

### Make a safe configuration change

> "Change the hallway light threshold to 25 lux."

The agent should find the correct source, make the minimum change, show the diff, validate where possible, and explain any reload/restart requirement.

### Understand an unfamiliar Home Assistant object

> "What is `sensor.foo_bar` and what device/integration does it belong to?"

The agent should inspect live state plus registry metadata.

### Create an automation

> "When the garage door opens after sunset, turn on the garage lights for 10 minutes."

The agent should determine the correct configuration path, create or update the automation, validate the change, and summarize behavior.

### Investigate system problems

> "What is causing these errors in Home Assistant?"

The agent should inspect HA logs/system health and relevant configuration.

### Make broader maintenance changes

> "Find stale automations and entities that look unused, but don't delete anything yet."

The agent should use registry/runtime tools and configuration analysis to produce a reviewable proposal.

## 6. Core product requirements

### P0 — Conversation

- User can create a new agent session.
- User can send text prompts.
- Responses stream incrementally.
- Sessions can be resumed after closing the UI.
- User can interrupt/cancel a running turn.

### P0 — Agent provider

- Codex is supported in MVP.
- Authentication uses the supported Codex/ChatGPT account flow where available.
- Provider/model status is visible in settings.
- The frontend is not coupled to Codex-specific events.

### P0 — Home Assistant config access

- Agent workspace is the mounted Home Assistant config directory.
- Read/write access is configurable at app level.
- File changes are surfaced as structured events.
- Changed files can be inspected as diffs.

### P0 — Live Home Assistant capabilities

Through HA-MCP the agent can, at minimum:

- search/list entities;
- retrieve current state;
- inspect entity/device/area metadata;
- retrieve automation configuration;
- retrieve automation traces;
- inspect history/logbook where available;
- inspect logs/system health.

### P0 — Permissions

- User sees permission requests generated by the agent protocol.
- UI supports at least Reject and Allow Once.
- Write/destructive actions are visually distinct from reads.
- Running turns clearly indicate when they are waiting for user approval.

### P0 — Home Assistant integration

- App is available through Home Assistant sidebar / Ingress.
- Browser user does not separately authenticate to the app.
- WebSocket/streaming works through Ingress.
- App restart does not corrupt session metadata.

### P1 — Rich Home Assistant rendering

- Entity references can render friendly name, entity ID, state, and device/area context.
- Automation trace calls can render as a structured trace summary.
- File change events render as diffs.
- Shell commands render as compact expandable terminal entries.
- Unknown MCP tool calls render in a generic structured card.

### P1 — Provider abstraction

- Cursor ACP backend can be added without frontend changes.
- Backend can enumerate configured ACP providers.
- Provider-specific authentication/settings remain behind provider adapters or ACP auth capabilities.

### P1 — Session UX

- Recent sessions list.
- Session title generated from first user prompt or agent metadata.
- Rename/archive/delete support.
- Show provider/model used by a session.

### P2 — Advanced workflows

- Optional read-only mode.
- Optional per-tool HA-MCP restrictions.
- Branch/fork conversation where supported.
- Attach screenshots or local images to agent prompts.
- Home Assistant deep links from entity/device/automation cards.
- Optional git checkpointing / change review workflow.

## 7. UX principles

### Home Assistant first

Use Home Assistant terminology and concepts. Avoid generic coding-workbench vocabulary unless necessary.

### Progressive disclosure

A typical user should see:

- what the agent is doing;
- whether it changed anything;
- why it reached its conclusion.

Detailed MCP arguments, raw JSON, and terminal output should be expandable.

### Explain effects, not mechanisms

Prefer:

> "Read last 5 automation traces"

instead of:

> `ha_get_automation_traces({automation_id: ...})`

while retaining the raw call under Details.

### Diffs before consequences

The product should make file changes easy to review, particularly when a restart/reload or device-control consequence follows.

## 8. Success metrics

For an initial technical preview:

- ≥95% of sessions successfully initialize Codex and HA-MCP.
- A user can complete the four acceptance workflows without opening a terminal.
- No app restart is required between normal conversations.
- Permission requests are never silently dropped.
- A file mutation is always observable in the UI as a file-change event or post-turn change summary.
- UI remains usable on desktop and tablet widths.

Qualitative metric:

> A technically competent Home Assistant user should prefer this interface over opening a generic agent terminal for routine HA debugging and configuration changes.

## 9. Acceptance workflows

### Workflow A — state lookup

Prompt:

> "Find my living room lights and tell me which are currently on."

Expected:

- HA-MCP call(s) are visible;
- friendly names are shown;
- response is based on live state.

### Workflow B — automation diagnosis

Prompt:

> "Why didn't the hallway lights turn on last night?"

Expected:

- agent inspects configuration and trace/history;
- trace step that prevented action is identifiable;
- explanation is concise and actionable.

### Workflow C — file edit

Prompt:

> "Change this threshold from 10 to 20."

Expected:

- correct file is modified;
- diff is rendered;
- user can inspect the exact change;
- validation/reload advice is provided.

### Workflow D — combined source + runtime

Prompt:

> "This automation looks correct in YAML. Check its last runs and fix the real problem."

Expected:

- agent combines filesystem and HA-MCP runtime data;
- proposed change addresses runtime evidence rather than guessing from source alone.
