# Task 023 — Add automation trace renderer

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 021

## Objective

Render HA-MCP automation trace output as a concise diagnostic timeline/card.

## Implementation

1. Capture representative `ha_get_automation_traces` result fixtures.
2. Parse run id/timestamp, trigger, ordered conditions/actions, explicit pass/fail/error and stop reason where present.
3. Render concise summary first; raw sanitized JSON remains expandable.
4. Never infer failure/actual values unless source data supports them.
5. Parsing failure uses generic MCP renderer.

```text
Hallway Lights — 21:42:17
✓ Motion trigger
✓ Sun below horizon
✕ Illuminance below 15 lx — actual 21.4 lx
Stopped at condition 3
```

## Validation

- [ ] Known trace fixture renders ordered steps.
- [ ] Missing optional fields do not throw.
- [ ] Unknown/new trace shape falls back to generic card.

Before committing, mark task 023 `✅ Done` in this file and tracker.