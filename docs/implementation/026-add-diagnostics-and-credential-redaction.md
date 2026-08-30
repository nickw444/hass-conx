# Task 026 — Add diagnostics and credential redaction

**Status:** ⬜ Not started  
**Phase:** Product hardening  
**Depends on:** 010, 018, 025

## Objective

Provide a useful diagnostics surface and central redaction so normal support logs do not expose credentials.

## Implementation

1. Diagnostics: app version/mode, workspace status, provider process/version/auth state, HA-MCP configured/auth/connection state, recent sanitized errors.
2. Central recursive redaction for Authorization headers, bearer/access/refresh tokens, API keys, OAuth authorization codes and provider credential fields.
3. Never send process environment or raw provider config home contents to browser.
4. Provide copyable sanitized diagnostics JSON.

```ts
redact({authorization: "Bearer abc"})
// => {authorization: "[REDACTED]"}
```

## Validation

- [ ] Nested arrays/objects and case-insensitive header keys are tested.
- [ ] Simulated OAuth logs contain no token/code values.
- [ ] Diagnostics payload contains no provider secrets.

Before committing, mark task 026 `✅ Done` in this file and tracker.