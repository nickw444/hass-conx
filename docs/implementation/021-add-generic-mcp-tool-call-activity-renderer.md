# Task 021 — Add generic MCP tool-call activity renderer

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 014, 016, 020

## Objective

Render every MCP tool call safely before specialized Home Assistant cards exist.

## Implementation

1. Show server, tool, running/completed/failed status, compact arguments and expandable result.
2. Never render arbitrary returned HTML.
3. Recursively redact known secret/auth fields before rendering.
4. Truncate large payloads in collapsed view; full sanitized JSON may be expanded.

```tsx
<McpCallCard server="home-assistant" tool="ha_get_state" status="completed" />
```

## Validation

- [ ] Tests cover running, success, failure, large JSON and redaction.
- [ ] Unknown HA-MCP tool renders without a specialized parser.

Before committing, mark task 021 `✅ Done` in this file and tracker.