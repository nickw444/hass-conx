# Task 005 — Add local hot-reload development command

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 003, 004

## Objective

Make `npm run dev` the normal local development loop with backend restart, Vite HMR, and API/WebSocket proxying.

## Implementation

1. Use `tsx watch` or equivalent for backend.
2. Use `concurrently` at root to run backend + Vite.
3. Vite proxies `/api` and future `/ws` to `127.0.0.1:3001`.
4. Frontend uses relative URLs only; never hard-code a production hostname.

```json
"dev": "concurrently -k \"npm:dev:server\" \"npm:dev:web\"",
"dev:server": "npm run dev -w apps/server",
"dev:web": "npm run dev -w apps/web"
```

## Validation

- [ ] `npm run dev` starts both processes.
- [ ] React edit updates via HMR.
- [ ] Backend edit restarts automatically.
- [ ] Browser API calls use Vite proxy.

Before committing, mark this file and tracker task 005 `✅ Done`. Preferred commit: `task 005: add local hot reload development command`.