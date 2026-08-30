# Task 016 — Build conversation and activity stream UI

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 004, 015

## Objective

Build the first usable chat screen with streamed messages and generic activity rows.

## Implementation

1. Small WebSocket client module with reconnect and last-sequence tracking.
2. Composer with Send and Cancel states.
3. Render user messages, streamed agent text, turn status and generic command/file/MCP rows.
4. Auto-scroll only when user is near bottom.
5. Replay after reconnect must not duplicate events.

```tsx
<ActivityRow icon="terminal" title="Ran command" status="completed" details={command} />
```

## Validation

- [ ] Two agent deltas render as one coherent message.
- [ ] Cancel appears only during active turn.
- [ ] Reconnect does not duplicate replayed activity.
- [ ] Desktop and tablet widths remain usable.

Before committing, mark task 016 `✅ Done` in this file and tracker.