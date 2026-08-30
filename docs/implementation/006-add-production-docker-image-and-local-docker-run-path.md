# Task 006 — Add production Docker image and local Docker run path

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 001-005

## Objective

Build one production image usable for local parity testing and later HA app packaging.

## Expected files

`Dockerfile`, `.dockerignore`, optional local compose file.

## Implementation

1. Multi-stage Node 22 image.
2. Build shared/server/web workspaces.
3. Production server serves built web assets.
4. Prefer non-root runtime if compatible with Codex/ACP; document exception if not.
5. Default command starts backend.

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
CMD ["npm", "run", "start", "-w", "apps/server"]
```

## Validation

- [ ] `docker build -t hass-conx:dev .` succeeds.
- [ ] Container responds on health route.
- [ ] Bind-mounted workspace/data directories work with runtime UID.

Before committing, mark this file and tracker task 006 `✅ Done`. Preferred commit: `task 006: add production docker image and local docker run path`.