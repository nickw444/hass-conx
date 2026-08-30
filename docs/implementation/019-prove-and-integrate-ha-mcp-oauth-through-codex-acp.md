# Task 019 — Prove and integrate HA-MCP OAuth through codex-acp

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 010-013, 018

## Objective

Mandatory interoperability task: connect Codex through `codex-acp` to the **Webhook Proxy for HA-MCP** public URL with OAuth enabled in `ha_auth` mode, and surface the required user interaction in Hass-Conx.

## Implementation

1. Use a real test HA-MCP + Webhook Proxy configured with `Enable OAuth=true`, `OAuth Mode=ha_auth`.
2. Inject the webhook URL into a Codex session and trigger a Home Assistant tool need.
3. Observe exactly how Codex App Server/codex-acp reports downstream MCP auth.
4. If ACP surfaces auth URL/state, map it to existing auth UI.
5. If it does not, implement the **smallest provider-specific bridge/ACP extension** that exposes Codex downstream MCP OAuth. Prefer upstream compatibility/contribution.
6. Do not build a replacement OAuth authorization server or ask for HA password.
7. If behavior requires an architectural note, record it under `docs/decisions/`.

```text
Expected flow:
1. Agent reports Home Assistant MCP authorization required.
2. UI shows “Sign in to Home Assistant”.
3. User completes HA OAuth/PKCE in browser.
4. Agent continues/retries and HA-MCP tools become available.
```

## Validation

- [ ] Fresh provider state completes OAuth end-to-end.
- [ ] After auth, a real HA-MCP read tool succeeds.
- [ ] Restart behavior is tested/documented: token reuse or clear re-auth.
- [ ] Hass-Conx contains no custom OAuth authorization server.

Before committing, mark task 019 `✅ Done` in this file and tracker. If interoperability is impossible with current upstream versions, mark `⛔ Blocked`, record exact versions/log-safe evidence, and do not guess a workaround.