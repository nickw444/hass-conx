# MVP Delivery Plan

The executable task plan lives in [`implementation/README.md`](implementation/README.md). Each task there is intentionally small enough to give to a low-capability coding model without requiring it to redesign the system.

## Delivery principle

Prove the architecture **locally first**, then package the same application for Home Assistant.

Critical hypothesis:

> A local Hass-Conx process can launch Codex through `codex-acp`, use a configurable workspace, inject the OAuth-enabled HA-MCP Webhook Proxy URL, stream ACP events to a browser, and later run unchanged inside HA Ingress with `/homeassistant` as the workspace.

## Phase 1 — application foundation

- TypeScript/npm-workspace scaffold.
- Validated runtime configuration.
- Fastify backend and React/Vite frontend.
- Local hot-reload loop.
- Production Docker image.
- Workspace abstraction plus safe HA fixture.

Exit condition: `npm run dev` presents the UI and backend locally and can inspect the configured workspace.

## Phase 2 — ACP/Codex vertical slice

- ACP process supervision and protocol client.
- `codex-acp` provider.
- ChatGPT/Codex authentication.
- Session creation/resume.
- Prompt streaming/cancel.
- Normalized frontend event stream.
- Browser WebSocket transport.
- Permission handling.

Exit condition: local browser can run a Codex turn against the fixture workspace and display streaming activity.

## Phase 3 — HA-MCP

- Configure HA-MCP public webhook URL.
- Prove standard MCP OAuth through `codex-acp`.
- Inject MCP server into sessions.
- Generic MCP activity rendering.
- Entity/state renderer.
- Automation trace renderer.

Exit condition: while Hass-Conx runs locally, a Codex conversation can inspect live HA state and traces through the OAuth-enabled Webhook Proxy.

## Phase 4 — file/persistence/diagnostics

- Rich file diff UX.
- Session/settings persistence.
- Diagnostics/status surface.
- Credential/log redaction and security tests.

Exit condition: local mode is reliable enough for day-to-day development.

## Phase 5 — Home Assistant packaging

- Ingress-aware routing.
- HA app manifest/config mount.
- Published container image/release workflow.
- End-to-end HAOS install test.

Exit condition: the same acceptance flows work through Home Assistant Ingress using `/homeassistant` as workspace.

## Phase 6 — provider-neutral proof

- Cursor ACP provider.
- Optional custom ACP command configuration.

Exit condition: the same browser/event/HA-MCP pipeline works with a second agent implementation.

## Required end-to-end scenarios

1. **Local file read/edit:** fixture workspace read, edit, diff.
2. **Local live state:** local Hass-Conx -> public HA-MCP webhook -> OAuth -> entity state.
3. **Local trace diagnosis:** retrieve and summarize an automation trace.
4. **Packaged file read/edit:** same flow against `/homeassistant` through Ingress.
5. **Packaged live state:** same OAuth HA-MCP path from the HA app container.

Do not skip local-mode validation and jump directly to Supervisor packaging; that would create a slow feedback loop and couple ordinary development to Home Assistant deployment mechanics.
