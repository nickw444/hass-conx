# Spike 002 — headless/browser authentication

This directory contains a dependency-free contract prototype. It does not
start an agent, open a browser, log in, log out, call a provider, or read any
existing credential store.

Run the fixture tests from the repository root:

```sh
node --test spikes/002-headless-auth/auth-flow.test.mjs
```

The module exercises:

- ACP authentication-method parsing for Codex and Cursor;
- Codex device-code URL/code validation;
- conservative parsing of Cursor's `NO_OPEN_BROWSER=1 agent login` output;
- Home Assistant Ingress base-path and WebSocket URL construction;
- login-id correlation, stale completion rejection, expiry/revocation,
  cancellation, logout, and process-failure states;
- provider-specific write-only API-key environment injection and redaction.

The API-key environment helper returns a secret only to model the boundary at
which the backend would launch a dedicated provider process. Production code
must not put that object in an event, URL, argv, browser response, or log.
