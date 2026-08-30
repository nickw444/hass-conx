# Task 001 — Create TypeScript workspace scaffold

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** None

## Objective

Create the monorepo skeleton and baseline tooling. Do not implement application behavior yet.

## Expected files

`package.json`, `tsconfig.base.json`, `.gitignore`, `apps/server/package.json`, `apps/web/package.json`, `packages/shared/package.json`, and minimal compilable source entrypoints.

## Implementation

1. Use npm workspaces: `apps/*` and `packages/*`.
2. Require Node 22+.
3. Root scripts: `build`, `typecheck`, `test`; `dev` can remain a placeholder until task 005.
4. TypeScript: `strict: true`, ES2022 target, consistent ESM/NodeNext setup.
5. Each workspace must compile but must not yet add Fastify/React/ACP behavior.

## Expected shape

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": {"node": ">=22"},
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

## Validation

- [ ] `npm install` succeeds.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.
- [ ] No runtime dependency on Home Assistant exists yet.

## Completion

Do not implement later tasks. Before committing, set this file and tracker task 001 to `✅ Done`. Preferred commit: `task 001: create typescript workspace scaffold`.