# Spike 007 — ACP permission and activity-event fidelity

Status: ACP v1 transport and application safety rules accepted; authenticated
core lifecycle and MCP qualification passed for the tested provider
installations. Provider-specific permission, diff, location, and complete
activity fidelity remain provider-defined.

Date: 2026-08-30 (Australia/Sydney)

## Question and original fixture conclusion

What can a Home Assistant ACP client honestly show and control when Codex or
Cursor performs filesystem, shell, permission, and MCP work?

The ACP boundary is precise but narrower than a filesystem audit log:

- `session/update` can represent agent-reported messages, tool lifecycle,
  tool content, diffs, and file locations.
- The client can observe and execute the optional `fs/*` and `terminal/*`
  methods when it advertises those capabilities. These are direct client RPCs,
  not notifications that an agent's other writes happened.
- `session/request_permission` carries provider-supplied options and the
  selected outcome. Permission is optional in ACP; a client must not promise
  that every write, shell command, or MCP mutation will prompt.
- ACP has no MCP call RPC. MCP work is provider-owned. A provider may report an
  MCP operation as a normal tool update, but ACP does not guarantee that it
  will report the server call, arguments, result, locations, or resulting
  filesystem changes.
- A shell command can create, modify, or delete files without any ACP file
  event. A post-turn filesystem snapshot can detect a difference, but cannot
  prove which command caused it or recover a diff without reading the files.

Therefore the product can guarantee faithful display of received ACP messages,
tool updates, terminal output, permission requests/responses, and explicit
diff/location fields. It must label shell/MCP/file activity as provider-reported
or externally observed and must never present the ACP projection as a complete
  change audit, transaction log, sandbox, or rollback mechanism.

## Current authenticated qualification update

The later 2026-08-30 qualification supersedes the original authentication-gate
boundary for the tested installations. Codex and Cursor both passed
authenticated ACP initialization, session creation, streaming, cancellation,
load after provider restart, standard local HTTP MCP injection, and a harmless
MCP tool call. The safe command emitted no permission event, confirming that
permission behavior is provider-defined rather than universal. The fixture's
direct filesystem, terminal, permission, and disconnect assertions remain the
authoritative application safety contract; exact provider permission options,
diff/location reporting, shell-side effects, and richer MCP activity still need
separate provider/build qualification.

## Sources and date

Official documentation was reviewed on 2026-08-30. The ACP site currently
redirects unversioned pages to the stable v1 pages.

- [ACP v1 overview](https://agentclientprotocol.com/protocol/v1/overview):
  JSON-RPC requests/notifications, client versus agent responsibilities,
  baseline lifecycle, optional client methods, absolute paths, and
  `session/update`.
- [ACP v1 tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls):
  `tool_call`, `tool_call_update`, statuses, `kind`, `rawInput`, `rawOutput`,
  `content`, `locations`, diff content, and permission options/outcomes.
- [ACP v1 file system](https://agentclientprotocol.com/protocol/v1/file-system):
  `fs/read_text_file`, `fs/write_text_file`, capability checks, and absolute
  paths.
- [ACP v1 terminals](https://agentclientprotocol.com/protocol/v1/terminals):
  `terminal/create`, `terminal/output`, `terminal/wait_for_exit`,
  `terminal/kill`, `terminal/release`, output limits, and terminal content.
- [ACP v1 cancellation](https://agentclientprotocol.com/protocol/v1/cancellation):
  generic `$/cancel_request` and its optional nature. Prompt cancellation is
  also exposed by the v1 lifecycle as `session/cancel`.
- [Official ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk):
  `client(...)`, `agent(...)`, `connect(...)`, and the stable v1 package entry
  point. The fixture pins `@agentclientprotocol/sdk@1.4.0`.
- [Maintained Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp):
  the official-maintained npm adapter used by the real probe,
  `@agentclientprotocol/codex-acp@1.7.0`.
- [Cursor native ACP](https://cursor.com/docs/cli/acp):
  `agent acp`, stdio JSON-RPC, `initialize`, `authenticate`, `session/new`,
  `session/prompt`, `session/update`, `session/request_permission`, and
  `session/cancel`.

The protocol pages are normative documentation. The runtime facts below are
observations from this spike and are not claims that every provider version
behaves identically.

## Method and safety boundary

The standalone fixture uses the official TypeScript SDK on both sides of a
child-process ACP connection. It creates a fresh workspace under `/tmp`, starts
an HTTP-only localhost fake MCP server, and permits only `/bin/sh` commands in
that temporary workspace. It never touches the repository workspace or
`/config`.

The isolated real-provider probe creates fresh `HOME`, `CODEX_HOME`, and Cursor
configuration/data directories. It forwards no API/token environment
variables, sets `NO_BROWSER=1`, calls only `initialize` and `session/new`, and
never calls `authenticate`, `agent login`, or any status command against a real
home. Traces are redacted and temporary paths are canonicalized.

## Executable fixture

The fixture performs the same logical operations through a deterministic ACP
agent:

1. Creates `direct-acp.txt` through the client RPC `fs/write_text_file`, with a
   `tool_call`/`tool_call_update`, absolute location, and ACP diff content.
2. Writes `.storage/core.config_entries` through the same direct ACP filesystem
   RPC and emits an ACP diff/location. The fixture treats this as an opaque
   text path; it does not claim Home Assistant `.storage` validity.
3. Runs a harmless shell command through `terminal/create`,
   `terminal/wait_for_exit`, `terminal/output`, and `terminal/release`.
4. Emits a destructive-labelled shell tool call, requests all four standard
   permission option kinds, selects `allow-once`, and runs a temp-only command
   that creates `shell-created.txt`, modifies `shell-modified.txt`, and deletes
   `shell-deleted.txt`.
5. Calls a localhost fake MCP server for `read_state`, then writes temporary
   MCP state and restores the original value. The server records one read and
   two writes. No ACP MCP RPC exists; the fixture emits ordinary tool updates
   for the MCP work.
6. Starts a second prompt, sends `session/cancel`, and verifies
   `stopReason: "cancelled"`.
7. Starts a fresh ACP connection whose permission handler deliberately holds a
   permission request. The harness closes the connection and reaps the child
   without returning a permission response. This verifies that disconnect does
   not auto-approve the action.

The generated trace is deterministic: temporary paths and the fake MCP port
are canonicalized, the session and tool IDs are fixed, and two consecutive
runs produced byte-identical output.

Results from the captured run:

- `initialize`, `session/new`, direct ACP file edit, direct `.storage` edit,
  shell effects, permission options/resolution, MCP read/reversible write,
  diffs/locations, terminal output, prompt completion, cancellation, and
  pending-permission disconnect: passed.
- Final MCP state equals its initial `seed` value after the reversible write.
- Shell create/modify/delete effects are visible only through the harness's
  post-run snapshot; no ACP filesystem notification was generated for them.
- The pending permission has zero resolutions when the connection is closed.

## What each ACP surface can represent

| Surface | Direction | What it can represent | What it cannot guarantee |
|---|---|---|---|
| `initialize` | client → agent / response | Protocol version and negotiated agent capabilities; client capabilities are the inputs that authorize optional client RPCs | That the agent will use an advertised capability or request permission before acting |
| `session/update` `agent_message_chunk` | agent → client notification | Streamed assistant/user text chunks | Complete output if the provider omits, truncates, or sends provider extensions |
| `session/update` `tool_call` / `tool_call_update` | agent → client notification | Tool title, ID, kind (`read`, `edit`, `delete`, `execute`, etc.), status, optional raw input/output, optional content, optional locations | A provider-independent tool taxonomy, mandatory reporting, or a causal record of every side effect |
| Tool content `diff` | agent → client notification field | Absolute path plus old/new text; suitable for a diff card when supplied | A diff for a shell/MCP/provider-native edit that did not include one; binary or semantic HA changes |
| Tool `locations` | agent → client notification field | Absolute path and optional 1-based line for follow-along display | That the location list is exhaustive or that a location means the file was actually changed |
| `fs/read_text_file` | agent → client request / client response | Direct agent read through the client filesystem bridge, including the exact absolute path and returned text | Reads performed by provider-owned shell, MCP, or native filesystem code; permission is not built into the RPC |
| `fs/write_text_file` | agent → client request / client response | Direct agent text write; client sees path and content and can apply its own path policy | A standard permission handshake, atomicity/rollback, semantic validity, or writes performed elsewhere |
| `terminal/create` | agent → client request / client response | Command, argument list, cwd, env request, output limit, and terminal ID; client owns command execution | That the command is safe, that all child processes terminate, or which files it changes |
| `terminal/output` / `wait_for_exit` | agent → client request / client response | Captured output, truncation, exit code/signal, and terminal lifecycle | File attribution, a full output history after provider/client loss, or output from commands not run through this bridge |
| `terminal/release` / `kill` | agent → client request / client response | Client-side resource/process control | Cleanup of detached descendants outside the client's process-group policy |
| `session/request_permission` | agent → client request / client response | Provider-supplied tool context and option IDs/kinds; selected or cancelled outcome | Universal prompting: ACP says agents may request permission, not that every operation must do so |
| `session/cancel` | client → agent notification | Prompt-turn cancellation when the provider implements it; a pending permission must be answered as cancelled when the turn is cancelled | Guaranteed immediate termination; generic JSON-RPC cancellation is separately optional |
| `mcpServers` in `session/new` | client → agent request field | Logical MCP server configuration passed to an agent that supports it | MCP tool-call visibility, permission semantics, server result fidelity, or provider acceptance |
| MCP transport | provider ↔ MCP server, outside ACP | Whatever the provider's MCP client and server exchange | An ACP-standard `mcp/call`, MCP-specific activity event, or file-change event |

The fixture's `events` array is deliberately a mixed application diagnostic:
ACP `session/update` events are marked `source: "acp.session.update"`, client
filesystem/terminal/permission observations are marked
`source: "acp.client.rpc"`, and post-run filesystem comparisons are marked
`source: "external.snapshot"`. The production event store must preserve this
distinction.

## Provider capability and observation matrix (original pre-authenticated run)

The provider rows below reflect the authentication-gated probe captured by this
spike. The current authenticated qualification update above supersedes its
core lifecycle/MCP limitations for the tested installations; provider-specific
permission and activity guarantees remain intentionally bounded.

| Capability / scenario | Codex ACP 1.7.0 | Cursor native Agent 2026.07.23-e383d2b | Determination |
|---|---|---|---|
| ACP v1 `initialize` | Passed; protocol 1 | Passed; protocol 1 | Accepted shared baseline |
| Isolated auth surface | `api-key` observed with `NO_BROWSER=1` | `cursor_login` observed | Provider-specific, observed |
| Unauthenticated `session/new` | JSON-RPC `-32000 Authentication required` | JSON-RPC `-32000 Authentication required`; error data advises `agent login` then `authenticate` | Accepted gate behavior; no account used |
| `session/update` tool/message fidelity | Not exercised past auth gate | Not exercised past auth gate | Inconclusive for authenticated providers; fixture-passed protocol shape |
| Direct ACP filesystem RPC | Not exercised past auth gate | Not exercised past auth gate | Fixture-passed; requires authenticated provider run |
| Shell terminal RPC/output | Not exercised past auth gate | Not exercised past auth gate | Fixture-passed; requires authenticated provider run |
| Provider permission request options | Not exercised past auth gate | Not exercised past auth gate | Fixture-passed only; exact provider policy remains unknown |
| MCP read/write attribution | `mcpServers` shape not reached | `mcpServers` shape not reached | Inconclusive; ACP has no MCP call RPC |
| `session/cancel` | Not exercised past auth gate | Not exercised past auth gate | Fixture-passed; provider-specific cancellation needs auth |
| Pending permission during browser disconnect | Fixture-passed at client/process layer | Fixture-passed at client/process layer | Accepted application safety rule; provider reconnect semantics unverified |

Real evidence is in
[`spikes/007-permission-fidelity/fixtures/real-probe.json`](../../spikes/007-permission-fidelity/fixtures/real-probe.json).
It contains no credential, authentication request, or real workspace path.

## Manual authenticated test checklist

Run this only with disposable provider accounts, a disposable HA instance, and
an isolated provider home. Keep credentials and full file contents out of
traces. Repeat the checklist for both Codex and Cursor, and on representative
HA `amd64` and `aarch64` app images.

1. Authenticate through the provider's documented ACP/login flow, confirm the
   browser-facing UI receives only the intended URL/code/status, and verify
   credentials remain in the dedicated provider home.
2. Create a session rooted at the disposable `/config`; record negotiated
   capabilities, modes, config options, and MCP transport capabilities.
3. Ask for a direct text edit and verify `session/update` tool status, absolute
   `locations`, diff `oldText`/`newText`, and the client `fs/write_text_file`
   request. Confirm the app event has `source: acp.session.update` for the
   provider report and `source: acp.client.rpc` for the direct write.
4. Ask for a direct edit to a disposable `.storage`-style path. Confirm the
   exact path is displayed, no semantic-validity or rollback claim appears,
   and no unrelated `/config` content enters diagnostics.
5. Run a harmless shell command and then a destructive-labelled command that
   only changes disposable files. Record `terminal/create`, output, exit
   status, release, and any permission request. Compare an external snapshot
   with provider-reported locations; document any attribution gap.
6. Exercise all provider-supplied permission options. Select each option in
   separate runs where safe, verify the exact option ID is returned, and verify
   rejected actions do not execute. Do not auto-select an option in the app.
7. Configure a disposable MCP server with one read and one reversible write.
   Verify server/tool success and result metadata, whether the provider emits
   a tool update, whether locations/diffs are supplied, and whether a write
   happened without a permission request. Restore the server state.
8. Cancel during streamed output and during a pending permission. Verify
   `session/cancel`, the prompt stop reason, the required cancelled permission
   outcome where supported, bounded process cleanup, and no post-cancel tool
   completion falsely shown as success.
9. Disconnect the browser while a permission is pending, reconnect within the
   window, and verify the same interaction card resumes without auto-resolution.
   Let the window expire and verify `EXPIRED`; kill the provider and verify
   `ORPHANED`/`INTERRUPTED`. Start a new ACP process and confirm the old
   request ID cannot be answered.
10. Repeat after app restart and provider process restart using `session/load`
    where advertised. Compare provider history against the local event log and
    mark missing provider-owned activities rather than synthesizing them.

Authenticated runs are release evidence only when the account, provider
version, app image digest, architecture, capabilities, and redacted trace are
recorded. They remain separate from the deterministic CI fixture.

## UI guarantees and explicit non-guarantees

The UI may guarantee:

- Every received `session/update` is ordered by the application event sequence,
  retained as a provider-reported activity, and displayed with generic
  fallback for unknown update types.
- A permission card shows the exact provider option IDs, labels, and kinds;
  the response is sent only to the originating ACP request/session generation.
- A terminal card shows received output, truncation, exit code/signal, and
  whether the observation came from ACP terminal RPCs.
- A diff card is shown only when the provider supplies ACP diff content; a
  location/follow-along card is shown only for supplied absolute locations.
- External snapshots, if implemented, are labelled as snapshots and not as
  ACP-originated events.

The UI must not guarantee:

- that every filesystem write, `.storage` mutation, shell command, MCP call,
  or physical Home Assistant effect will request permission;
- that an ACP tool event is exhaustive or that an absent event proves no
  change occurred;
- that terminal output identifies all created/modified/deleted paths;
- that MCP calls have a standard ACP activity shape or that a tool named MCP
  is actually a successful server call unless the provider reports that result;
- that displaying a diff creates a checkpoint, backup, transaction, or rollback;
- that disconnecting the browser cancels or reverses work already accepted by
  the provider.

## Pending-permission state and reconnect rules

The production backend should add an application-owned interaction identity;
ACP request IDs alone are not durable across process reconnects:

```text
PENDING --selected--> RESOLVED
PENDING --cancelled--> CANCELLED
PENDING --reconnect timeout--> EXPIRED
PENDING --ACP/process loss--> ORPHANED
```

Each pending row should contain `interactionId`, app `sessionId`, provider
session ID, ACP connection generation, provider request/tool ID, redacted tool
summary, exact options, created time, reconnect deadline, and state. It must
not contain raw authorization headers, MCP secrets, or unrestricted tool
arguments by default.

Rules:

1. On a browser disconnect, keep the ACP process and permission request pending
   for a short bounded reconnect window. Reconnected clients receive the
   pending card from durable state; they do not auto-answer it.
2. Bind every answer to `interactionId`, session ID, connection generation,
   and an expected state/version. Reject stale, duplicate, cross-session, or
   post-expiry answers without sending them to ACP.
3. On explicit user cancellation while permission is pending, send
   `session/cancel`; if the provider follows ACP's rule, answer the outstanding
   permission request with `{ outcome: { outcome: "cancelled" } }`, then wait
   only a bounded time before process cleanup.
4. On reconnect-window expiry, do not choose allow or reject on the user's
   behalf. Mark the interaction `EXPIRED`, request provider cancellation where
   possible, and reap the process if it does not stop.
5. On ACP connection/process loss, mark unresolved interactions `ORPHANED` or
   `INTERRUPTED`; never replay their permission response into a new process.
   A later `session/load` may restore conversation context, but an old JSON-RPC
   request ID and permission decision are not resumable across the new
   connection.
6. Persist a visible turn/process state such as `awaiting_permission`,
   `cancelling`, `interrupted`, or `failed`. Never show a tool as completed
   merely because a permission request was sent or a process disappeared.

The fixture specifically proves rule 5's safety property: a held permission
request has zero resolutions after connection close and process reap.

## Fallback and best-effort rules

- If the provider does not advertise `fs.writeTextFile` or `terminal`, do not
  call those methods. Use provider-reported tool updates only.
- If a provider emits a tool update without locations or diff content, render a
  generic activity and do not synthesize a false path/diff.
- If shell work is enabled, an optional bounded before/after snapshot may add
  `external.snapshot` events for files under `/config`. State clearly that this
  is post-hoc detection, not ACP attribution, and avoid reading secrets or
  large databases by default.
- If an agent owns filesystem execution and sends no ACP `fs/*` request, do not
  claim direct-file fidelity. A file watcher can supplement visibility but
  cannot identify the responsible tool or recover a trustworthy old/new diff
  without additional content reads.
- For MCP, persist only server name, tool name, success/error, and redacted
  provider metadata when explicitly reported. Do not invent an MCP call event
  from a `mcpServers` configuration entry.
- On unknown `session/update` variants, retain a redacted generic activity and
  the provider/version rather than dropping the event or treating it as a
  successful write.
- If a permission request lacks a safe human-readable summary or options,
  fail closed, surface the malformed request, and do not auto-select an
  option.

## Accepted, rejected, and inconclusive findings

### Accepted

- One official ACP TypeScript SDK client can negotiate ACP v1 with both real
  provider processes observed in Spike 001 and this probe.
- The ACP protocol has explicit surfaces for `session/update`, direct client
  filesystem/terminal RPCs, permission options/outcomes, terminal output, tool
  diff content, and optional locations.
- A deterministic child-process fixture can execute and capture all requested
  safety-relevant lifecycle cases without real credentials.
- The app can safely retain pending-permission state and refuse to resolve it
  on browser disconnect or process loss.

### Rejected product claims

- “All edits are visible.”
- “All writes and shell/MCP actions require a permission prompt.”
- “ACP gives us a complete audit trail or rollback.”
- “An MCP server configured in `session/new` is a successful/readable MCP
  activity.”
- “A terminal tool update identifies every file changed by the command.”

### Inconclusive or provider-specific after current qualification

- Authenticated Codex/Cursor permission option sets and whether each provider
  emits locations/diffs for direct, shell, `.storage`, and MCP operations.
- Authenticated provider cancellation timing and whether a provider can leave
  detached terminal descendants after ACP cancellation.
- Whether either provider reports MCP tool calls with enough metadata to offer
  richer MCP cards.
- Recovery semantics for a permission request when the provider process stays
  alive across a browser reconnect versus when a new ACP process calls
  `session/load`.

## Exact design changes

1. Add `source` and `fidelity` to the normalized event envelope. At minimum,
   distinguish `acp.session.update`, `acp.client.rpc`, `external.snapshot`,
   and `provider.extension`; mark `provider_reported`, `client_observed`, or
   `posthoc_observed` rather than implying causality.
2. Retain tool `rawInput`/`rawOutput` only under the existing redaction and
   size policy. Keep `content` diff blocks and `locations` in structured fields
   so the UI can render them without parsing raw ACP.
3. Add the pending interaction state machine and generation/version checks from
   the previous section. Make expiry, browser disconnect, cancellation,
   process exit, and duplicate response transitions explicit tests.
4. Keep direct ACP filesystem writes and terminal RPCs behind the negotiated
   client capabilities and a workspace path policy. Do not infer permissions
   from ACP method names; permission prompting remains provider-originated.
5. Add optional, clearly labelled post-turn snapshot detection for `/config`
   only if product owners accept its performance/privacy cost. It must never
   convert a snapshot into a claimed ACP diff or rollback record.
6. Add provider capability flags for `reportsDiff`, `reportsLocations`,
   `reportsTerminalContent`, `reportsMcpToolActivity`, and
   `permissionCoverage: "provider-defined"`. Render missing capabilities
   rather than silently assuming parity.
7. Treat `.storage` as a high-risk ordinary path. Surface the exact path when
   ACP reports it, warn that no semantic validation or rollback exists, and
   require the existing trust acknowledgement for `/config` access.
8. Add the fixture and authenticated secret-enabled provider runs to the parity
   gate. The fixture is deterministic and CI-safe; real account runs belong in
   a controlled manual/secret environment and must not publish credentials or
   unrestricted file contents.

## Rerun instructions

From the repository root:

```sh
cd spikes/007-permission-fidelity
npm ci --cache /tmp/hass-conx-npm-cache-007
npm run typecheck
npm test
npm run fixture -- --out fixtures/fidelity-run.json
npm run probe-real -- --out fixtures/real-probe.json
```

The fixture uses only a temporary workspace and localhost fake MCP server. The
real probe uses isolated homes, does not call authentication, and intentionally
stops at the unauthenticated gate. It is safe to run without a provider account.
Do not replace the isolated homes with a real home and do not add API/token
environment variables to the probe.

The package lock pins:

| Package | Version |
|---|---:|
| `@agentclientprotocol/sdk` | `1.4.0` |
| `@agentclientprotocol/codex-acp` | `1.7.0` |
| `tsx` | `4.23.12` |
| `typescript` | `7.0.2` |
| `@types/node` | `26.1.0` |

The generated `node_modules` directory is intentionally not retained. After
running locally, remove only that generated directory:

```sh
rm -rf /Users/nickw/repos/hass-conx/spikes/007-permission-fidelity/node_modules
```

## Artifacts

- [Standalone fixture source](../../spikes/007-permission-fidelity/src/harness.ts)
- [Fidelity event mapping](../../spikes/007-permission-fidelity/src/contract.ts)
- [Fixture assertions](../../spikes/007-permission-fidelity/src/harness.test.ts)
- [Isolated real-provider probe](../../spikes/007-permission-fidelity/src/probe-real.ts)
- [Fixture package manifest](../../spikes/007-permission-fidelity/package.json)
- [Fixture package lock](../../spikes/007-permission-fidelity/package-lock.json)
- [Deterministic fixture trace](../../spikes/007-permission-fidelity/fixtures/fidelity-run.json)
- [Redacted real-provider summary](../../spikes/007-permission-fidelity/fixtures/real-probe.json)

No production paths, other spike paths, credentials, or binaries were changed.
No commit was created.
