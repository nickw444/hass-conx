# Task 027 — Make routing and assets Home Assistant Ingress-safe

**Status:** ⬜ Not started  
**Phase:** HA packaging  
**Depends on:** 003-005, 015-016

## Objective

Make the production SPA plus HTTP/WebSocket calls work under arbitrary Home Assistant Ingress prefixes rather than assuming origin root `/`.

## Implementation

1. Frontend builds API/WebSocket URLs relative to current Ingress base or a bootstrap-provided base path.
2. Do not hard-code `/api` at hostname root when behind Ingress.
3. Server serves SPA fallback correctly under prefixed route.
4. Test WebSocket upgrade with representative Ingress prefix/proxy headers.
5. Preserve local root-mode behavior.

```ts
// Conceptual: derive URLs relative to current document/ingress base.
const current = new URL(window.location.href);
const wsProtocol = current.protocol === "https:" ? "wss:" : "ws:";
```

## Validation

- [ ] Proxy test serves app under representative `/api/hassio_ingress/<token>/` prefix.
- [ ] Bootstrap and WebSocket work through prefix.
- [ ] Local `/` development still works.

Before committing, mark task 027 `✅ Done` in this file and tracker.