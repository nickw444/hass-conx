# Home Assistant Agent — Design Pack

This design pack captures the proposed product and technical direction for a Home Assistant-native AI development and diagnostics experience powered by interchangeable coding-agent backends.

The working product name **Home Assistant Agent** is a placeholder.

## Documents

1. [Executive Summary](00-executive-summary.md) — product thesis, architecture, scope, and key decisions.
2. [Product Requirements Document](01-prd.md) — users, jobs-to-be-done, product requirements, non-goals, and success criteria.
3. [Technical Design](02-technical-design.md) — runtime architecture, Home Assistant app packaging, process model, storage, networking, and event flow.
4. [ACP & Agent Backend Design](03-agent-backend-acp.md) — ACP-first provider architecture, Codex, Cursor, custom agents, authentication, and lifecycle.
5. [HA-MCP Integration](04-ha-mcp-integration.md) — how HA-MCP is used as the Home Assistant capability layer and what remains the responsibility of the coding agent.
6. [Web UI / UX Specification](05-ui-ux-spec.md) — Home Assistant-native conversational UX, activity rendering, diffs, traces, approvals, and settings.
7. [Security & Permissions](06-security-permissions.md) — trust boundaries, filesystem access, MCP permissions, approvals, secrets, and hardening.
8. [MVP Delivery Plan](07-mvp-roadmap.md) — staged implementation plan, milestones, validation tests, and suggested issue/PR breakdown.
9. [Open Questions & Risks](08-open-questions-and-risks.md) — unresolved architectural decisions, research spikes, and fallback strategies.
10. [Frontend Event Contract](09-frontend-event-contract.md) — normalized event model between the backend and browser UI.

## Core architecture in one sentence

**Our app owns the Home Assistant-native web experience and ACP client; Codex/Cursor/other agents own reasoning and coding; HA-MCP owns live Home Assistant capabilities; Home Assistant owns authentication, app lifecycle, and Ingress.**

## Key upstream dependencies

- OpenAI Codex: <https://github.com/openai/codex>
- Codex ACP adapter: <https://github.com/agentclientprotocol/codex-acp>
- Agent Client Protocol: <https://agentclientprotocol.com/>
- HA-MCP: <https://github.com/homeassistant-ai/ha-mcp>
- Home Assistant app documentation: <https://developers.home-assistant.io/docs/apps/>
- Home Assistant app presentation / Ingress: <https://developers.home-assistant.io/docs/apps/presentation/>

## Status

Initial architecture / pre-implementation design, prepared 2026-08-30.
