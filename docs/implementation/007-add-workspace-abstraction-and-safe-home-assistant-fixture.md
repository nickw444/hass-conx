# Task 007 — Add workspace abstraction and safe Home Assistant fixture

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 002

## Objective

Centralize workspace validation and add a harmless HA-style fixture as local default.

## Expected files

`apps/server/src/workspace.ts`, `dev/homeassistant-fixture/configuration.yaml`, `automations.yaml`, optional package fixture, tests.

## Implementation

1. `WorkspaceService` resolves root and reports existence/writability.
2. Backend helper path resolution must prevent traversal outside root; the coding agent itself receives the root directly.
3. Fixture contains valid-looking non-secret HA YAML and at least one automation.
4. Do not create a realistic secrets file.

```ts
export class WorkspaceService {
  constructor(private readonly root: string) {}
  async validate(): Promise<{exists: boolean; writable: boolean}> { /* ... */ }
  get rootPath() { return this.root; }
}
```

## Validation

- [ ] Tests cover missing/readable/writable path.
- [ ] Default local config starts with fixture.
- [ ] Fixture supports later read/edit prompts.

Before committing, mark this file and tracker task 007 `✅ Done`. Preferred commit: `task 007: add workspace abstraction and safe home assistant fixture`.