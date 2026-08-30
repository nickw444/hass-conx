# Task 012 — Implement ACP session create, list and resume

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 007, 009-011

## Objective

Create agent sessions rooted at the configured workspace and resume by provider session id. Persistence to disk is task 025.

## Implementation

1. Internal session metadata: Hass-Conx id, provider id, provider session id, title, timestamps.
2. New session uses configured `workspacePath` as cwd.
3. List recent/active in-memory sessions.
4. Resume existing provider session using ACP support.
5. Permit only one active turn per session for MVP.

```ts
interface SessionRecord {
  id: string;
  providerId: string;
  providerSessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
```

## Validation

- [ ] Create returns local and provider ids.
- [ ] ACP cwd equals configured workspace.
- [ ] Resume targets same provider session.
- [ ] Second concurrent turn is rejected cleanly.

Before committing, mark task 012 `✅ Done` in this file and tracker. Preferred commit: `task 012: implement acp session create list and resume`.