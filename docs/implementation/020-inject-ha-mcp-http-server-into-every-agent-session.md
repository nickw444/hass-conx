# Task 020 — Inject HA-MCP HTTP server into every agent session

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 012, 018, 019

## Objective

Supply the configured OAuth-enabled HA-MCP HTTP endpoint programmatically to each agent session.

## Implementation

1. When URL exists, include HTTP MCP server named `home-assistant` during session creation.
2. Do not write provider-global `~/.codex/config.toml` or Cursor configuration.
3. With no endpoint, session starts in filesystem-only degraded mode.
4. Surface MCP initialization/auth/ready errors as session diagnostics/activity.

```ts
const mcpServers = config.haMcpUrl ? [{
  name: "home-assistant",
  transport: "http",
  url: config.haMcpUrl,
}] : [];
```

## Validation

- [ ] Session fixture captures injected endpoint.
- [ ] No-url session still starts.
- [ ] Real Codex session calls an HA-MCP read tool after OAuth.

Before committing, mark task 020 `✅ Done` in this file and tracker.