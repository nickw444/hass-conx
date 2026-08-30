# Task 014 — Implement normalized Hass-Conx event model

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 013

## Objective

Translate ACP/provider updates into the stable browser contract described by `docs/09-frontend-event-contract.md`.

## Implementation

1. Add discriminated unions for agent messages, plan/reasoning summary, commands, file changes, MCP calls, permissions, errors and turn/session states.
2. Every event includes `sessionId`, optional `turnId`, timestamp and monotonic sequence.
3. Preserve provider-specific detail only as optional diagnostic data, not required UI contract.
4. Unknown provider notifications must not crash normalization.

```ts
export type ClientEvent =
  | {type:"agent.message.delta"; sequence:number; sessionId:string; text:string}
  | {type:"tool.mcp"; sequence:number; sessionId:string; server:string; tool:string; status:"running"|"completed"|"failed"}
  | {type:"file.change"; sequence:number; sessionId:string; paths:string[]; status:string};
```

## Validation

- [ ] Golden tests map representative Codex ACP events.
- [ ] Sequences strictly increase.
- [ ] Unknown event does not throw.
- [ ] Hidden/private reasoning is never exposed unless provider explicitly supplies a user-visible summary.

Before committing, mark task 014 `✅ Done` in this file and tracker.