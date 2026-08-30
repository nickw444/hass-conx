# Task 025 — Persist settings and session metadata

**Status:** ⬜ Not started  
**Phase:** Product hardening  
**Depends on:** 012, 018

## Objective

Persist Hass-Conx-owned metadata under configured `dataPath` so restarts retain settings and session list.

## Implementation

1. Persist HA-MCP URL/config, session id/title/provider/provider-session-id, timestamps and UI metadata.
2. For MVP, atomic JSON files are acceptable; if SQLite is chosen, justify it rather than adding complexity by default.
3. JSON writes use temp file + rename.
4. Provider OAuth/token storage remains owned by provider-specific data home; do not duplicate tokens in Hass-Conx schema.
5. Corrupt state produces a clear recoverable diagnostic.

```ts
interface PersistedSession {
  id: string;
  providerId: string;
  providerSessionId: string;
  title: string;
  updatedAt: string;
}
```

## Validation

- [ ] Restart reloads session/settings metadata.
- [ ] Corrupt file reports controlled error.
- [ ] Persistence schema contains no OAuth access/refresh-token fields.

Before committing, mark task 025 `✅ Done` in this file and tracker.