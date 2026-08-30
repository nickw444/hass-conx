# Task 022 — Add Home Assistant entity/state renderer

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 021

## Objective

Render common HA-MCP entity/state/search results as Home Assistant-friendly cards while preserving generic fallback.

## Implementation

1. Create a tool-renderer registry with `matches()` and conversion to a stable card view model.
2. Capture representative real HA-MCP response fixtures.
3. Entity view model: entity id, friendly name, state, selected attributes, device/area when available.
4. If response shape changes or parsing fails, use generic MCP card rather than throwing.

```ts
interface EntityCardModel {
  entityId: string;
  name?: string;
  state: string;
  area?: string;
  attributes: Record<string, unknown>;
}
```

## Validation

- [ ] Light/entity fixture renders name/id/state.
- [ ] Missing optional fields are tolerated.
- [ ] Unknown response shape falls back cleanly.

Before committing, mark task 022 `✅ Done` in this file and tracker.