# Hass-Conx Design & Implementation Documentation

Hass-Conx is a Home Assistant-native conversational development and diagnostics UI built on ACP agent runtimes and HA-MCP.

## Architecture documents

| Document | Purpose |
|---|---|
| [Executive Summary](00-executive-summary.md) | Product thesis and key architectural choices |
| [Product Requirements](01-prd.md) | User goals, requirements and acceptance workflows |
| [Technical Design](02-technical-design.md) | Runtime, local dev loop, packaging and networking |
| [ACP / Agent Backend](03-agent-backend-acp.md) | ACP lifecycle, Codex/Cursor and provider integration |
| [HA-MCP Integration](04-ha-mcp-integration.md) | Separate HA-MCP app + Webhook Proxy + OAuth contract |
| [UI / UX](05-ui-ux-spec.md) | Conversation, activities, approvals and HA renderers |
| [Security & Permissions](06-security-permissions.md) | Trust boundaries, OAuth, workspace and capability policy |
| [MVP Roadmap](07-mvp-roadmap.md) | Delivery phases and end-to-end milestones |
| [Open Questions & Risks](08-open-questions-and-risks.md) | Required spikes and unresolved risks |
| [Frontend Event Contract](09-frontend-event-contract.md) | Normalized server-to-browser event model |

## Implementation task tracker

The authoritative implementation sequence is:

**[docs/implementation/README.md](implementation/README.md)**

Each task is deliberately atomic and contains exact scope, expected code shape, validation commands and a completion protocol for coding agents.

## Canonical deployment assumptions

- HA-MCP runs as the separate **Home Assistant MCP Server** app.
- **Webhook Proxy for HA-MCP** remains installed and provides the public MCP endpoint.
- Webhook Proxy OAuth is enabled using `ha_auth`.
- Hass-Conx uses the public webhook URL in both local and packaged modes.
- Hass-Conx edits files directly through its configured workspace; HA-MCP file/YAML beta tools remain off by default.
- Local development must work without Supervisor or Ingress.
