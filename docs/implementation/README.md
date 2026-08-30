# Hass-Conx Implementation Task Tracker

This directory is the **authoritative implementation sequence**. Tasks are deliberately small and prescriptive so a coding agent with limited planning ability can execute one task at a time without redesigning the project.

## Agent operating rules

1. Work on **one task file at a time** unless the user explicitly asks otherwise.
2. Read the task, its dependencies, and the relevant architecture docs before editing code.
3. Do not expand scope. If a prerequisite is missing, mark the task `⛔ Blocked` in this table and explain why.
4. Run every validation check listed in the task.
5. **Before committing a completed task, update that task's Status in this table to `✅ Done` in the same commit.**
6. If work has started but is incomplete, status may be `🚧 In progress`; do not mark Done until validation passes.
7. Use one focused commit per task where practical. Preferred subject: `task NNN: <short description>`.
8. Do not mark dependent/future tasks complete opportunistically without running their own validation.

Allowed statuses: `⬜ Not started`, `🚧 In progress`, `✅ Done`, `⛔ Blocked`.

## Task index

| ID | Task | Phase | Status | Depends on |
|---|---|---|---|---|
| [001](001-create-typescript-workspace-scaffold.md) | Create TypeScript workspace scaffold | Foundation | ⬜ Not started | None |
| [002](002-implement-validated-runtime-configuration.md) | Implement validated runtime configuration | Foundation | ⬜ Not started | 001 |
| [003](003-create-fastify-backend-skeleton.md) | Create Fastify backend skeleton | Foundation | ⬜ Not started | 001, 002 |
| [004](004-create-react-vite-application-shell.md) | Create React/Vite application shell | Foundation | ⬜ Not started | 001, 003 |
| [005](005-add-local-hot-reload-development-command.md) | Add local hot-reload development command | Foundation | ⬜ Not started | 003, 004 |
| [006](006-add-production-docker-image-and-local-docker-run-path.md) | Add production Docker image and local Docker run path | Foundation | ⬜ Not started | 001-005 |
| [007](007-add-workspace-abstraction-and-safe-home-assistant-fixture.md) | Add workspace abstraction and safe Home Assistant fixture | Foundation | ⬜ Not started | 002 |
| [008](008-implement-acp-child-process-supervisor.md) | Implement ACP child-process supervisor | ACP/Codex | ⬜ Not started | 003 |
| [009](009-implement-minimal-acp-json-rpc-client.md) | Implement minimal ACP JSON-RPC client | ACP/Codex | ⬜ Not started | 008 |
| [010](010-add-codex-acp-provider-definition.md) | Add Codex ACP provider definition | ACP/Codex | ⬜ Not started | 008, 009 |
| [011](011-surface-codex-acp-authentication-flow.md) | Surface Codex/ACP authentication flow | ACP/Codex | ⬜ Not started | 010 |
| [012](012-implement-acp-session-create-list-and-resume.md) | Implement ACP session create, list and resume | ACP/Codex | ⬜ Not started | 007, 009-011 |
| [013](013-implement-prompt-streaming-and-cancellation.md) | Implement prompt streaming and cancellation | ACP/Codex | ⬜ Not started | 012 |
| [014](014-implement-normalized-hass-conx-event-model.md) | Implement normalized Hass-Conx event model | ACP/Codex | ⬜ Not started | 013 |
| [015](015-add-browser-websocket-protocol-and-replay-buffer.md) | Add browser WebSocket protocol and replay buffer | ACP/Codex | ⬜ Not started | 003, 014 |
| [016](016-build-conversation-and-activity-stream-ui.md) | Build conversation and activity stream UI | ACP/Codex | ⬜ Not started | 004, 015 |
| [017](017-implement-acp-permission-request-ux.md) | Implement ACP permission request UX | ACP/Codex | ⬜ Not started | 014-016 |
| [018](018-add-ha-mcp-endpoint-settings-and-connection-status-model.md) | Add HA-MCP endpoint settings and connection status model | HA-MCP | ⬜ Not started | 002, 016 |
| [019](019-prove-and-integrate-ha-mcp-oauth-through-codex-acp.md) | Prove and integrate HA-MCP OAuth through codex-acp | HA-MCP | ⬜ Not started | 010-013, 018 |
| [020](020-inject-ha-mcp-http-server-into-every-agent-session.md) | Inject HA-MCP HTTP server into every agent session | HA-MCP | ⬜ Not started | 012, 018, 019 |
| [021](021-add-generic-mcp-tool-call-activity-renderer.md) | Add generic MCP tool-call activity renderer | HA-MCP | ⬜ Not started | 014, 016, 020 |
| [022](022-add-home-assistant-entity-state-renderer.md) | Add Home Assistant entity/state renderer | HA-MCP | ⬜ Not started | 021 |
| [023](023-add-automation-trace-renderer.md) | Add automation trace renderer | HA-MCP | ⬜ Not started | 021 |
| [024](024-implement-file-change-and-diff-experience.md) | Implement file-change and diff experience | Product hardening | ⬜ Not started | 007, 014, 016 |
| [025](025-persist-settings-and-session-metadata.md) | Persist settings and session metadata | Product hardening | ⬜ Not started | 012, 018 |
| [026](026-add-diagnostics-and-credential-redaction.md) | Add diagnostics and credential redaction | Product hardening | ⬜ Not started | 010, 018, 025 |
| [027](027-make-routing-and-assets-home-assistant-ingress-safe.md) | Make routing and assets Home Assistant Ingress-safe | HA packaging | ⬜ Not started | 003-005, 015-016 |
| [028](028-add-home-assistant-app-manifest-and-config-mount.md) | Add Home Assistant app manifest and config mount | HA packaging | ⬜ Not started | 006, 027 |
| [029](029-publish-multi-architecture-container-image-in-ci.md) | Publish multi-architecture container image in CI | HA packaging | ⬜ Not started | 006, 028 |
| [030](030-run-local-and-home-assistant-end-to-end-acceptance-suite.md) | Run local and Home Assistant end-to-end acceptance suite | Release validation | ⬜ Not started | 001-029 |

## Definition of done

A task is complete only when its implementation is finished, required tests/checks pass, no unrelated refactor is bundled, the task file Status is `✅ Done`, and this tracker row is changed to `✅ Done` **before the task commit**. For manual integration checks, record exact versions/results in the requested validation artifact or commit/PR.