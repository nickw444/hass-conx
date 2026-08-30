# Task 017 — Implement ACP permission request UX

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 014-016

## Objective

Let users resolve provider/ACP permission requests from the conversation UI.

## Implementation

1. Normalize request id, provider, operation summary, choices and details.
2. Render a prominent pending permission card.
3. Support Reject and Allow Once when offered; never fabricate unavailable choices.
4. Send selected option using exact provider request correlation id.
5. Disable duplicate submission after click.
6. Do not display an already-applied file change as pending approval.

```tsx
<PermissionCard
  title="Codex wants to modify automations.yaml"
  actions={["reject", "allow_once"]}
/>
```

## Validation

- [ ] Fixture blocks until response.
- [ ] Reject/allow-once map correctly.
- [ ] Duplicate click produces one provider response.
- [ ] Applied changes are labeled applied.

Before committing, mark task 017 `✅ Done` in this file and tracker.