# Task 015 — Add browser WebSocket protocol and replay buffer

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 003, 014

## Objective

Connect browser and backend for session commands and normalized streamed events, including short reconnect replay.

## Implementation

1. Add `/ws` with Fastify WebSocket support.
2. Commands: session create/resume, turn start/cancel, permission response.
3. Server sends normalized events, never raw ACP wire messages.
4. Maintain bounded recent per-session event buffer and `afterSequence` replay.
5. Validate all inbound messages; malformed input returns structured error.

```ts
type BrowserCommand =
  | {type:"session.create"; providerId:"codex"}
  | {type:"turn.start"; sessionId:string; text:string}
  | {type:"turn.cancel"; sessionId:string};
```

## Validation

- [ ] Integration test creates session and receives fixture events.
- [ ] Reconnect after a sequence replays only missed events.
- [ ] Invalid JSON/command does not crash server.

Before committing, mark task 015 `✅ Done` in this file and tracker.