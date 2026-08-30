# Task 009 — Implement minimal ACP JSON-RPC client

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 008

## Objective

Speak ACP over stdio independently of provider. Only implement initialization and generic request/notification plumbing.

## Implementation

1. Prefer official ACP TypeScript SDK; custom wire code must remain minimal.
2. Implement initialize handshake and capability capture.
3. Correlate request IDs to promises.
4. Dispatch notifications to typed listeners.
5. Fail pending requests if child exits.

```ts
export interface AcpConnection {
  initialize(clientInfo: {name: string; version: string}): Promise<AcpCapabilities>;
  request<T>(method: string, params: unknown): Promise<T>;
  onNotification(listener: (method: string, params: unknown) => void): () => void;
}
```

## Validation

- [ ] Protocol fixture verifies initialize.
- [ ] Concurrent request IDs correlate correctly.
- [ ] Malformed JSON returns controlled protocol error.

Before committing, mark this file and tracker task 009 `✅ Done`. Preferred commit: `task 009: implement minimal acp json rpc client`.