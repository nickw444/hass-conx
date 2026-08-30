# Task 003 — Create Fastify backend skeleton

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 001, 002

## Objective

Create a testable Fastify backend with health/bootstrap routes and graceful shutdown. No ACP yet.

## Expected files

`apps/server/src/index.ts`, `apps/server/src/app.ts`, server tests.

## Implementation

1. Implement `buildServer(config)` so tests instantiate without listening.
2. `GET /api/health` returns status, mode and app version.
3. `GET /api/bootstrap` returns browser-safe mode/feature information only. Do not leak secrets or unnecessary absolute paths.
4. Handle SIGTERM/SIGINT and close cleanly.

```ts
app.get("/api/health", async () => ({
  status: "ok",
  mode: config.mode,
  version: packageVersion,
}));
```

## Validation

- [ ] Fastify injection tests cover both routes.
- [ ] Local process responds on `/api/health`.
- [ ] SIGTERM exits cleanly.

Before committing, mark this file and tracker task 003 `✅ Done`. Preferred commit: `task 003: create fastify backend skeleton`.