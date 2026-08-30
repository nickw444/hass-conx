# Task 018 — Add HA-MCP endpoint settings and connection status model

**Status:** ⬜ Not started  
**Phase:** HA-MCP  
**Depends on:** 002, 016

## Objective

Represent the public OAuth-enabled Webhook Proxy URL and connection/auth status without implementing an MCP client in Hass-Conx.

## Implementation

1. Initial URL source: `HASS_CONX_HA_MCP_URL`; task 025 may persist user settings later.
2. Validate HTTP/HTTPS URL.
3. Status states: unconfigured, unreachable, auth_required, connecting, ready, error.
4. A 401 from OAuth-protected webhook is not equivalent to server-down.
5. UI may show endpoint hostname/path summary; never expose bearer credentials.

```ts
type HaMcpStatus =
  | {status:"unconfigured"}
  | {status:"auth_required"}
  | {status:"ready"}
  | {status:"error"; message:string};
```

## Validation

- [ ] URL validation tests.
- [ ] Logs redact Authorization/token data.
- [ ] Settings UI distinguishes unconfigured/auth-required/error.

Before committing, mark task 018 `✅ Done` in this file and tracker.