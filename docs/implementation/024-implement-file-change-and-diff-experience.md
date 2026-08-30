# Task 024 — Implement file-change and diff experience

**Status:** ⬜ Not started  
**Phase:** Product hardening  
**Depends on:** 007, 014, 016

## Objective

Show exactly which workspace files the agent changed and the applied/proposed state truthfully.

## Implementation

1. Render path, add/update/delete kind, and status.
2. Use provider-supplied patch/diff when available.
3. If only changed paths exist, backend may compute a post-turn diff when a safe baseline exists; do not invent a pre-approval diff.
4. Start with plain unified diff; syntax highlighting optional.
5. Distinguish `proposed`, `applying`, `applied`, `failed` only when provider semantics support them.

```diff
- below: 10
+ below: 20
```

## Validation

- [ ] Add/update/delete cases render.
- [ ] Applied change is never labeled merely Proposed.
- [ ] Large diff remains scrollable/responsive.

Before committing, mark task 024 `✅ Done` in this file and tracker.