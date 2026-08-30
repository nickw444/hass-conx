# Spike 006 — ACP session recovery

This directory contains a dependency-free deterministic model of the
application-owned recovery boundary around ACP. It models one ACP subprocess
per active conversation, an append-only per-session event journal, transient
browser connections, pending permissions/elicitations, provider session/load
capabilities, and crash/restart transitions.

It does not start Codex or Cursor, perform authentication, access credentials,
open a browser, or make network requests. It intentionally does not install
Spike 001's dependencies: the Spike 001 `node_modules` directory is absent.
The fixture uses the same ACP v1 normalized event vocabulary and provider
session/load shapes observed in Spike 001's official SDK harness.
`fixtures/provider-capabilities.json` is a narrow, credential-free copy of
the unauthenticated capability observations used by the tests; it does not
claim that the auth-gated provider sessions passed recovery.

Run from the repository root:

```sh
node --test spikes/006-session-recovery/recovery.test.mjs
```

The test model covers:

- browser disconnect/reconnect with strict sequence-suffix replay;
- backend restart while idle and while a turn is active;
- agent `SIGKILL`, process generations, and orphaned running turns;
- pending permission/elicitation preservation without auto-resolution;
- provider `session/load` supported versus unsupported recovery;
- local event-log versus provider-history reconciliation;
- duplicate, stale, and future browser commands with idempotency keys;
- immutable event schema migration and application-version events;
- one foreground turn and one ACP process per active conversation.

`recovery.mjs` is a contract prototype, not production persistence or an ACP
transport. Its snapshots are JSON-shaped to make restart/migration fixtures
reviewable and rerunnable.
