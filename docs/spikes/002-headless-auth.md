# Spike 002 — Headless/browser authentication behind Home Assistant Ingress

**Date:** 2026-08-30
**Status:** Architecture and contract accepted; Codex subscription and Cursor
subscription authentication passed in the later qualification, while Codex
API-key authentication and final packaged Ingress UX remain open
**Scope:** Codex ChatGPT subscription login, Codex API-key configuration, and Cursor login for the administrator-only Ingress app

## Original pre-qualification result

The recommended design is an application-owned authentication coordinator with
one provider adapter per ACP agent. The browser receives only public status and
short-lived, explicitly approved external-login data. Provider credentials stay
in the provider's isolated home or in a child-process environment; access and
refresh credentials never enter the ACP event log, SQLite, browser history,
API responses, command-line arguments, prompts, or ordinary diagnostics. A
one-time device/login URL may cross to the authenticated browser transiently,
but is not a provider credential and must not be persisted by this app.

- **Codex subscription:** accept the ACP `chat-gpt-device-code` method and URL
  elicitation as the primary remote-browser path. It has no localhost callback
  and therefore fits Ingress. Treat the standard `chat-gpt` browser method as
  unsupported for MVP because the current Codex app-server returns a
  `localhost:<port>/auth/callback` URL.
- **Codex API key:** the write-only secret control, provider-specific process
  environment, ACP login selection, redaction, and synthetic status path are
  structurally tested. A real API-key authentication and provider request are
  **unverified** because no test key was available and no login was initiated.
- **Cursor subscription:** use an isolated `NO_OPEN_BROWSER=1 agent login`
  bootstrap, display its external URL transiently, then run native `agent acp`.
  ACP `cursor_login` remains the capability-discovered path. The installed
  binary's normal help does not advertise `--auth-token`, although current
  official docs describe `CURSOR_AUTH_TOKEN`; do not expose that fallback
  unless the packaged binary feature-detects and supports it.
- **Ingress:** generate all app HTTP/WebSocket URLs relative to the trusted
  Ingress base path. Never rewrite an OpenAI/Cursor login URL as an app-relative
  URL and never create a localhost callback through Ingress.
- **Validation:** fixture tests pass (9/9). No provider login, logout, browser
  interaction, real account, existing credential store, or live Home Assistant
  app was touched. Those are manual follow-ups, not evidence of failure.

## Current authenticated qualification update

The later 2026-08-30 qualification supersedes the original no-login status for
the tested installations: Codex ChatGPT subscription authentication and Cursor
account authentication completed, and both providers then passed ACP
initialization, session creation, streaming, cancellation, load after provider
restart, and standard local HTTP MCP injection. The original fixture remains
the authoritative evidence for parser, redaction, and Ingress URL contracts;
the authenticated run does not qualify the final packaged image or a live HA
Ingress release matrix. Codex API-key authentication remains explicitly
unverified. Cursor distribution/legal approval remains a release gate.

## Scope and safety boundary

The probe was read-only and deliberately isolated. It used temporary
`CODEX_HOME`, `HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` directories and
only non-interactive `--version`, `--help`, and status commands. No existing
credential file was inspected, copied, or changed. No login or logout command
was run against an account. The prototype has no network, process, filesystem,
or credential-store dependency.

Artifacts:

- [`auth-flow.mjs`](../../spikes/002-headless-auth/auth-flow.mjs) — parsers,
  redaction, Ingress URL helpers, authentication flow plan, and provider-neutral
  state machine.
- [`auth-flow.test.mjs`](../../spikes/002-headless-auth/auth-flow.test.mjs) —
  dependency-free Node fixtures and nine tests.
- [`README.md`](../../spikes/002-headless-auth/README.md) — safe rerun
  instructions and prototype boundary.

The implementation is intentionally not production code. In particular, the
`credentialEnvironment` helper models the one place where a backend may create
a secret-bearing child-process environment; callers must not serialize or log
its return value.

## Versions and safe commands

| Item | Result | Notes |
|---|---|---|
| `codex --version` | `codex-cli 0.150.1` | Existing CLI was queried only for version/help/status. |
| `agent --version` | `2026.07.23-e383d2b` | Cursor native CLI installed at `/Users/nickw/.local/bin/agent`; status was run in isolated homes. |
| `cursor --version` | `3.15.6` plus `arm64` build metadata | This is the separate desktop wrapper and was not used for ACP or auth. |
| Maintained `codex-acp` source | package `1.7.0`; git `69ca755d9878238aecf0737c0e4568b3bab37be2` | Source read from the official repository; not installed or run by this spike. |
| Codex app-server source | git `dde85b435b16994f956bce08e5fb796ed94c27fd` | Official OpenAI repository snapshot used for endpoint and callback behavior. |
| ACP source | git `8a3fc6ff57465461d653756f16538f58bbbdf3d1` | Official protocol repository snapshot. |

Commands run safely:

```sh
probe_dir="$(mktemp -d /private/tmp/hass-conx-auth-probe.XXXXXX)"
mkdir -p "$probe_dir/codex" "$probe_dir/home" "$probe_dir/config" "$probe_dir/data"

command -v codex
codex --version
env CODEX_HOME="$probe_dir/codex" codex login status
env CODEX_HOME="$probe_dir/codex" codex login --help

command -v agent
agent --version
env HOME="$probe_dir/home" XDG_CONFIG_HOME="$probe_dir/config" XDG_DATA_HOME="$probe_dir/data" agent status
agent --help
agent login --help
agent status --help
agent acp --help

node --test spikes/002-headless-auth/auth-flow.test.mjs
```

The isolated Codex status reported `Not logged in`; isolated Cursor status
reported `Not logged in`. The Cursor probe created only non-secret default CLI
configuration in the temporary configuration home. `npm view` was also tried
for package metadata but was blocked by pre-existing root-owned files in the
user npm cache (`EPERM`); no permissions were changed. GitHub raw source and
the pinned commit IDs above were used instead.

## Primary sources and observed contracts

These are the official provider/protocol/Home Assistant sources used for this
spike; links are included so a future rerun can check for drift.

| Source | Relevant contract |
|---|---|
| [OpenAI Codex authentication](https://learn.chatgpt.com/docs/auth) | ChatGPT subscription and API-key modes; `codex login --device-auth`; headless browser limitations; `codex login status`; `codex logout`; `CODEX_HOME`/`auth.json` or OS keyring; refresh behavior; `cli_auth_credentials_store`. |
| [OpenAI Codex app-server README](https://github.com/openai/codex/blob/dde85b435b16994f956bce08e5fb796ed94c27fd/codex-rs/app-server/README.md) | JSONL stdio RPC; `account/read`, `account/login/start`, `account/login/completed`, `account/login/cancel`, `account/logout`, and `account/updated`; device-code response; localhost browser callback; credential refresh and persistence. |
| [Maintained codex-acp source](https://github.com/agentclientprotocol/codex-acp/tree/69ca755d9878238aecf0737c0e4568b3bab37be2) | ACP IDs `api-key`, `chat-gpt`, `chat-gpt-device-code`; URL elicitation gating; `CODEX_API_KEY` before `OPENAI_API_KEY`; device-code elicitation; account status/logout extensions; `CODEX_HOME`. |
| [Cursor CLI authentication](https://prod.cursor.com/docs/cli/reference/authentication) | `agent login`, `NO_OPEN_BROWSER=1`, secure local credential storage, `agent status`, `agent logout`, and API-key setup. |
| [Cursor ACP](https://prod.cursor.com/docs/cli/acp) | `agent acp`; ACP `cursor_login`; pre-authentication with `CURSOR_API_KEY`, `--api-key`, and documented `CURSOR_AUTH_TOKEN`/`--auth-token` paths. |
| [ACP authentication methods RFD](https://agentclientprotocol.com/rfds/auth-methods) | Authentication method UI semantics and safe environment-variable secret handling. |
| [ACP URL/form elicitation RFD](https://agentclientprotocol.com/rfds/elicitation) | URL mode is intended for sensitive OAuth/credential operations; credentials must not travel through model context or ACP messages. |
| [ACP logout announcement](https://agentclientprotocol.com/announcements/logout-method-stabilized) | Advertise logout capability; invalidate credentials; return unauthenticated; permit a later authenticate. |
| [Home Assistant app configuration](https://developers.home-assistant.io/docs/apps/configuration/) | `ingress`, `ingress_stream`, `panel_admin`, and app API settings. |
| [Home Assistant app presentation](https://developers.home-assistant.io/docs/apps/presentation/) | Ingress source restriction, `X-Ingress-Path`, HTTP/WebSocket support, and proxy behavior. |
| [Home Assistant app security](https://developers.home-assistant.io/docs/apps/security/) | `X-Remote-User-*` identity headers and authenticated Ingress assumptions. |

## Provider findings

### Codex ChatGPT subscription

The maintained ACP adapter advertises `chat-gpt-device-code` only when the ACP
client advertises URL elicitation. Its flow is:

1. Initialize ACP with URL elicitation support.
2. Call ACP `authenticate` with `chat-gpt-device-code`.
3. The app-server starts `account/login/start` with
   `chatgptDeviceCode` and returns a `loginId`,
   `https://auth.openai.com/codex/device`, and a one-time `userCode`.
4. The adapter sends a URL elicitation to the browser projection, showing the
   verified host and code. The code/URL exists only in active process memory and
   a short-lived authenticated response; it is not an event-store field.
5. The backend correlates completion and elicitation to `loginId`, handles user
   decline with `account/login/cancel`, then reads account status.
6. The provider persists and refreshes its subscription credentials in its
   supported store. The application stores only redacted account metadata and
   state transitions.

The ordinary `chat-gpt` ACP path is browser-based but app-server source shows a
`redirect_uri=http://localhost:<port>/auth/callback`. A browser reaching the HA
Ingress host cannot reach a localhost listener in an app container. It is
therefore rejected by the prototype with
`localhost_callback_not_ingress_safe`. A future explicitly supported local
tunnel would be a separate design and is not part of this MVP.

### Codex API key

Codex ACP accepts an API key from ACP authentication metadata or from
`CODEX_API_KEY`, falling back to `OPENAI_API_KEY`. The recommended app flow is a
write-only secret control followed by an isolated Codex child process. The
secret must not be placed in argv, the browser event stream, ACP user content,
SQLite, URL query parameters, or diagnostics. The process is responsible for
provider persistence if its selected auth mode stores the key; the app should
not duplicate it into its own database.

The prototype tests provider-specific environment naming, write-only handling
and redaction, and plans an explicit `structural_only` verification label. It
does not claim that the key can authenticate: that requires a disposable/test
key and a real provider request in a secret-enabled validation environment.

### Cursor subscription

The current official CLI supports `agent login`; with `NO_OPEN_BROWSER=1` it
prints an external URL instead of opening a local browser. The backend can run
this as an isolated bootstrap process, parse its status without retaining
tokens, expose a one-time external-login action, and then start `agent acp` for
normal sessions. ACP's `cursor_login` method should be preferred when the
client's negotiated methods include it.

The local Cursor bundle confirms a secure credential abstraction with file and
macOS keychain implementations. Its file implementation uses the platform
configuration family (`$XDG_CONFIG_HOME/<domain>/auth.json` on Linux, or the
equivalent home path) with a `0700` directory and `0600` file; the exact domain
name was not extracted and must not be hard-coded from this spike. Use a
dedicated provider `HOME`/`XDG_CONFIG_HOME`, pin the CLI build, and feature-test
the optional `AGENT_CLI_CREDENTIAL_STORE=file` override if it is used for
deterministic container storage. Do not inspect or copy a user's existing
Cursor cache.

The official docs describe `CURSOR_AUTH_TOKEN` and `--auth-token`, and local
bundled code contains a hidden implementation path, but `agent --help` for the
installed build did not advertise it. This is a compatibility warning, not a
recommendation to rely on an undocumented flag. The app must expose auth-token
only after runtime feature detection and an explicit validation of the pinned
binary.

## Recommended architecture and flow

Keep one shared `AuthCoordinator` in the backend, with provider adapters that
own process launch, ACP authentication, status, refresh/error mapping, and
logout. Keep provider homes separate:

```text
/data/provider-state/codex/   (CODEX_HOME; provider-owned auth/session state)
/data/provider-state/cursor/  (HOME/XDG config; provider-owned auth/session state)
/data/secret-state/           (only app-managed secret references, if needed)
```

Do not place provider auth caches in `/config` or in SQLite events. The app
installation has one shared provider account by product decision. A provider
account switch is global to all Home Assistant administrators and must be
presented as such.

The browser/backend choreography is:

```mermaid
sequenceDiagram
    participant B as Admin browser via HA Ingress
    participant A as AuthCoordinator
    participant P as Provider process
    participant E as External provider login

    B->>A: authenticate(provider, method)
    A->>P: initialize + authenticate (stdio ACP)
    P-->>A: public status or URL/device elicitation
    A-->>B: transient verified URL/code; no credential payload
    B->>E: user completes provider login
    E-->>P: provider auth completion
    P-->>A: correlated completion/account updated
    A-->>B: authenticated metadata only
```

For Cursor's CLI bootstrap, the same diagram has `P` as the isolated `agent
login` child first and a fresh native `agent acp` child after status succeeds.
The raw Cursor URL may contain a one-time query value; it must be retained only
in process memory for a one-time authenticated browser action, with a short
expiry and single-use correlation. The safe diagnostic projection in the
prototype strips its query. Never put that raw URL in logs, durable events,
the app's own browser state/history, or analytics. External navigation can be
recorded by the user's browser/provider and cannot be erased by this app; the
short expiry and one-time semantics limit that residual risk.

### Ingress/base-path rules

- Trust `X-Ingress-Path` only on requests received from the documented
  Supervisor Ingress source; reject direct-port requests and missing admin
  identity headers.
- Construct app REST and WebSocket URLs as `origin + ingressPath + relative
  path`; preserve the path for `wss` as well as `https`.
- Do not assume `/`; installations may mount the app at a generated path.
- Do not use a browser-supplied base path to choose a backend target.
- External provider URLs remain provider URLs. Navigate to an allowlisted
  `https` host after explicit user consent; do not proxy, redirect-rewrite, or
  iframe the provider login through HA Ingress.
- Keep the raw external URL out of the durable app event stream. Send only a
  short-lived, authenticated action or transient response, and show the
  destination host separately.
- Verify WebSocket origin and the Ingress base path on every reconnect; the
  WebSocket endpoint is not a public direct-port API.

### Restart, expiry, revocation, and process failure

On app restart, load only public provider status and application metadata. Ask
the provider for authoritative account status (`account/read` or `agent
status`); do not infer authentication from a stale local event. Mark orphaned
provider turns interrupted and require an explicit user action to resume.

Refresh-capable subscription credentials should be refreshed by the provider.
Map a refresh failure to `expired` when retry or reauthentication may work, and
`revoked` when the provider reports invalid/revoked credentials or a confirmed
401. Keep the old credential out of logs and do not repeatedly retry a
revoked/expired login in a loop. API-key errors should distinguish malformed,
revoked, rate-limited, and network failures where the provider exposes that
detail without echoing the key.

If a provider process exits, fail the pending turn, reject unresolved
permissions/elicitations, preserve redacted events, and offer a new process.
An account logout clears provider credentials through the provider's own logout
operation, waits for an unauthenticated status, and then clears app-side public
metadata. A switch-account action is logout plus a fresh login; stop active
provider sessions first so the old account cannot continue a turn.

## Provider state machine

The prototype's `AuthStateMachine` is provider-neutral and emits only a public
snapshot. Login completions and cancellations are accepted only when their
`loginId` matches the active attempt.

| State | Entry conditions | Browser-facing behavior |
|---|---|---|
| `unknown` | Startup before status, malformed/absent capability data | Show checking; do not offer a credential control yet. |
| `unauthenticated` | Provider reports no account and auth is not currently required | Offer provider login/configuration. |
| `login_required` | ACP/account status requires auth | Offer only negotiated supported methods. |
| `login_in_progress` | Non-browser API-key auth, or external login accepted by provider | Show pending status; never expose provider output verbatim. |
| `waiting_for_browser` | Device-code or Cursor URL bootstrap started | Show verified host and transient URL/code; allow cancel. |
| `authenticated` | Correlated completion or authoritative account status | Show provider, auth mode, optional email/plan metadata; never tokens. |
| `expiring` | Application/provider refresh warning | Prompt to reauthenticate without showing expiry token details. |
| `expired` | Refresh or token expiry failure | Stop new work; offer login again. |
| `revoked` | Provider reports credential revoked/invalid | Stop retries; require new credential/login. |
| `cancelled` | User declines/cancels active login | Clear pending elicitation; permit a fresh attempt. |
| `failed` | Malformed response, timeout, nonzero process, or unknown provider error | Show redacted actionable error and preserve diagnostic state. |
| `logged_out` | Provider logout completed and status is unauthenticated | Show signed-out state; all shared admins are affected. |

## Test matrix and results (original pre-qualification run)

This matrix records the fixture and unauthenticated source/CLI checks from
this spike. The current authenticated qualification update above supersedes
its provider-login and restart rows for the tested installations; API-key,
shared-account, and final packaged Ingress rows remain open.

| Area | Fixture/probe | Result | Evidence / remaining work |
|---|---|---|---|
| Codex method negotiation | ACP initialize fixture with API key, browser, device code, unknown method | **Accepted** | Parser retains unknown as unsupported and rejects localhost path. |
| Codex device code | Valid response plus non-HTTPS/lookalike hosts | **Accepted** | URL host/protocol, code, login ID and non-persistence are tested. Real completion remains manual. |
| Codex API key | Secret helper, redaction, planned process env | **Structurally tested; unverified** | No real key or provider request. Must pass secret-enabled E2E before release claim. |
| Cursor browser bootstrap | `Not logged in`, waiting URL, secure-token success strings | **Structurally tested** | Local CLI help/status and source examined; real browser completion remains manual. |
| Cursor API key/auth token | Official docs, local help/source comparison | **Inconclusive** | API-key env name is clear; auth-token advertisement differs. Feature-test pinned release. |
| Ingress HTTP/WebSocket | Synthetic origin, mount path, invalid absolute path | **Accepted** | Prototype preserves base path and maps `https` to `wss`; real HA proxy test remains manual. |
| State transitions | Login IDs, stale completion, cancellation, logout, revocation | **Accepted** | Nine Node tests; production persistence/concurrency implementation remains. |
| Restart/refresh | Provider contract/source review only | **Inconclusive** | Requires real persisted test account and app restart. |
| Shared account/switch | Architecture review | **Inconclusive** | Requires two-admin HA test and global logout/switch validation. |
| Secret leakage | Redaction fixtures and source review | **Accepted as design/fixture** | Requires live scan of logs, WebSocket, SQLite, diagnostics, and process inspection. |
| HA packaging/architecture | No HA app host in this spike | **Inconclusive** | Requires protected HA OS `amd64` and `aarch64` validation. |

Test fixtures are embedded in `auth-flow.test.mjs`: Codex initialize/auth
method data, valid/invalid device URLs and codes, Cursor status/login output,
Ingress origins/mount paths, stale login IDs, and synthetic secret-bearing
diagnostics. They contain no real credentials.

## Threat considerations and controls

- **Ingress bypass/direct port:** bind only to the Ingress port, keep no public
  host port, restrict the expected proxy source, require `X-Remote-User-Id`,
  and verify administrator status through Home Assistant.
- **Cross-admin account confusion:** credentials and sessions are intentionally
  shared per installation. Show the account identity and a global-impact
  warning before logout/switch; do not imply per-user isolation.
- **Token-bearing login URL:** Cursor URLs may carry one-time query data. Keep
  raw values transient and single-use; store only host/path in diagnostics;
  never put them in event rows, logs, URLs generated by the app, analytics, or
  prompts.
- **Credential leakage through process arguments/environment:** use environment
  or provider ACP metadata only at the supported boundary, never argv. Limit
  child environment inheritance (especially `SUPERVISOR_TOKEN`), permissions,
  and process visibility; treat same-container compromise as a real threat.
- **Prompt injection from `/config` or MCP:** authentication UI is outside model
  context; provider output cannot decide login consent or account switching.
  Require explicit authenticated browser action for external login and ACP
  permissions.
- **Stale completion/cross-session response:** correlate provider login IDs,
  ACP connection IDs, and browser user/session IDs; reject stale responses as
  the prototype does.
- **Backup/restore:** exclude provider credential files and app secret state
  from backups where supported; a restore should require reauthentication, not
  silently resurrect a copied credential.
- **Provider drift:** pin Codex ACP/app-server and Cursor builds/checksums,
  feature-negotiate methods, and fail closed when a supported auth method or
  storage contract changes.
- **Sensitive workspace:** `/config` may contain credentials and internal state;
  the product trust acknowledgement and model-provider disclosure remain
  required even though they are outside this auth implementation.

## Original manual validation checklist (before later qualification)

The checklist below is retained for provenance. The current qualification
update above records completed subscription login and core provider checks;
retain only the still-open API-key, shared-account, packaged-image, and live
Ingress cases as release work.

These actions require a browser, an intentionally chosen test account/key, and
an actual protected Home Assistant app. They were not performed in this spike.
The safest sequence is:

1. Use a disposable Home Assistant test instance or confirmed backup, schedule
   a maintenance window, and create dedicated test provider accounts/keys.
   Do not use a production account or copy an existing auth cache.
2. Build/install the app with `ingress: true`, `ingress_stream: true`,
   `panel_admin: true`, protection enabled, no public port, and dedicated
   provider-state directories. Confirm the app sees only the intended test
   `/config`.
3. Open the app only through HA Ingress. Verify admin identity, generated
   `X-Ingress-Path`, nested HTTP routes, WebSocket reconnect, direct-port
   rejection, and non-Ingress source rejection. Check that external login URLs
   are not rewritten to the app host.
4. In ChatGPT security/workspace settings, enable device-code login if the
   account/workspace requires that permission. From the app, negotiate URL
   elicitation, start Codex device-code auth, manually open the displayed
   `auth.openai.com` URL, enter the one-time code, and verify completion/account
   status. Capture only pass/fail and redacted metadata.
5. Restart the app and provider process. Verify Codex status remains
   authenticated without showing a credential. Test refresh near expiry if the
   provider offers a safe test mechanism. Explicitly test logout, revoked
   credentials, network failure, cancellation, timeout, and stale completion.
6. For Codex API key, use a disposable least-privilege/test key. Enter it into
   the write-only control, verify it is absent from browser responses, ACP
   events, argv, logs, SQLite, diagnostics, and shell history, then verify an
   authenticated API request. Revoke/rotate the key and confirm the UI reaches
   `revoked`/`expired` without an infinite retry. Only then change the result
   from structurally tested/unverified.
7. For Cursor, use a dedicated test account. Run the isolated login bootstrap
   with `NO_OPEN_BROWSER=1`, manually open the URL, verify status and secure
   persistence, restart, then start native `agent acp`, negotiate
   `cursor_login`, create a session, and test logout. Validate the exact
   credential path and permissions inside the packaged container without
   reading any unrelated user credential.
8. Test Cursor API-key setup with a disposable key through `CURSOR_API_KEY`.
   Test `CURSOR_AUTH_TOKEN`/`--auth-token` only if the pinned binary advertises
   it in help or a negotiated ACP capability; otherwise mark it unsupported.
9. With two HA administrators, verify that authentication, logout, account
   switch, and provider status are visibly global to the app installation.
   Stop active sessions before switching and prove the old account cannot
   continue a turn.
10. Restore a backup that excludes provider secrets and confirm the app asks
    for provider reauthentication. Scan application logs, WebSocket payloads,
    SQLite/event exports, and diagnostics for keys, tokens, one-time URLs, and
    `SUPERVISOR_TOKEN`.

Do not run logout as a cleanup shortcut on a real shared account. Use the
dedicated test accounts, record the account and credential lifecycle outside
the product logs, and revoke disposable credentials after the test.

## Rerun and handoff for the original prototype

From the repository root:

```sh
node --test spikes/002-headless-auth/auth-flow.test.mjs
```

Expected result: **9 passed, 0 failed**. The prototype remains accepted for
the architecture, parsers, redaction contract, Ingress path construction, and
state-machine fixture layer. The original inconclusive boundary is superseded
by the current authenticated result recorded above. Codex API-key authentication, Cursor's exact packaged credential-store
domain, ARM64/HA Ingress behavior, and final packaged restart/refresh remain
release work.
