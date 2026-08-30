# Task 008 — Implement ACP child-process supervisor

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 003

## Objective

Create provider-neutral child-process supervision for stdio ACP agents.

## Expected files

`apps/server/src/agent/process-supervisor.ts`, tests using a fixture process.

## Implementation

1. Process spec: provider id, command, args, cwd, env.
2. Spawn directly, never via shell interpolation.
3. Expose stdin/stdout streams and bounded stderr diagnostics.
4. Emit start/exit/error state.
5. Kill all managed children on backend shutdown.

```ts
export interface AgentProcessSpec {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}
```

## Validation

- [ ] Fixture child exchanges a line over stdio.
- [ ] Unexpected exit becomes structured status.
- [ ] Backend shutdown terminates child.

Before committing, mark this file and tracker task 008 `✅ Done`. Preferred commit: `task 008: implement acp child process supervisor`.