# Task 010 — Add Codex ACP provider definition

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 008, 009

## Objective

Launch `@agentclientprotocol/codex-acp` through the generic process/ACP layers.

## Expected files

`apps/server/src/providers/codex.ts`, provider registry, tests/smoke diagnostic.

## Implementation

1. Add codex-acp dependency or deterministic entrypoint resolution.
2. Provider metadata includes id `codex`, display name, command/args and capabilities.
3. Put provider-specific data/config home under configured `dataPath` where supported.
4. Do not hard-code model choice yet.

```ts
export const codexProvider: ProviderDefinition = {
  id: "codex",
  name: "OpenAI Codex",
  command: process.execPath,
  args: [resolveCodexAcpEntrypoint()],
};
```

## Validation

- [ ] Local backend starts codex-acp and completes ACP initialize.
- [ ] Missing provider binary/package gives clear diagnostic.
- [ ] Provider initialization requires no HA-specific settings.

Before committing, mark this file and tracker task 010 `✅ Done`. Preferred commit: `task 010: add codex acp provider definition`.