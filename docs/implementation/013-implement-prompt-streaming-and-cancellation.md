# Task 013 — Implement prompt streaming and cancellation

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 012

## Objective

Send prompts to a session, consume streamed ACP updates, track turn state and cancel a running turn.

## Implementation

1. Add `runTurn(sessionId, text)` that emits raw ACP updates to an internal listener/stream.
2. Track provider turn id and running/terminal state.
3. Add `cancelTurn(sessionId)` using ACP/provider cancellation.
4. Emit exactly one terminal completion/failure/cancel transition.
5. Provider failures must not crash server.

```ts
await sessionManager.runTurn(sessionId, "Read configuration.yaml");
await sessionManager.cancelTurn(sessionId);
```

## Validation

- [ ] Protocol fixture yields ordered streaming updates.
- [ ] Cancellation produces cancelled/interrupted terminal state.
- [ ] Simulated provider failure is isolated to turn/session.

Before committing, mark task 013 `✅ Done` in this file and tracker.