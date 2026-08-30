# Task 011 — Surface Codex/ACP authentication flow

**Status:** ⬜ Not started  
**Phase:** ACP/Codex  
**Depends on:** 010

## Objective

Expose authentication methods advertised by `codex-acp` and let the browser user complete ChatGPT/Codex sign-in without exposing tokens to frontend code.

## Expected areas

Provider/auth service, normalized auth state, small settings/auth UI.

## Implementation

1. Read ACP/provider-advertised auth methods; do not invent a parallel login protocol.
2. Browser-visible states: connected, required, in-progress, error.
3. For browser/device flows, expose only provider-supplied authorization URL and/or user code.
4. Keep provider credential files under its configured data home.
5. Implement logout only if codex-acp cleanly supports it.

```ts
type ProviderAuthState =
  | {status: "connected"}
  | {status: "required"; method: string; authorizationUrl?: string; userCode?: string}
  | {status: "error"; message: string};
```

## Validation

- [ ] Fresh provider data reports auth required.
- [ ] ChatGPT authentication reaches connected state.
- [ ] Browser payloads contain no access/refresh tokens.
- [ ] Restart reuses auth when provider supports persistence.

Before committing, mark this file and tracker task 011 `✅ Done`. Preferred commit: `task 011: surface codex acp authentication flow`.