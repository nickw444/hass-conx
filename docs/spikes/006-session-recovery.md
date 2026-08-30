# Spike 006 — ACP session recovery and browser/backend crash semantics

**Date:** 2026-08-30
**Status:** Recovery contract accepted; authenticated load-after-restart passed
for the tested provider installations. Final packaged-image and
multi-architecture restart qualification remains open.
**Scope:** One ACP subprocess per active conversation, durable application event projection, browser reconnect, backend/agent failure, provider session recovery, and schema/app upgrades

## Result

The application should treat three authorities separately:

1. The local event log is authoritative for the browser's reconnectable,
   ordered projection.
2. The provider session is authoritative for model context after recovery.
3. The process manager and application session row are authoritative for
   subprocess liveness and turn ownership.

Never rebuild provider context by replaying local user prompts. On recovery,
prefer ACP `session/load` when the provider supports it; use the now-stable ACP
`session/resume` when the provider can restore context but does not replay
history; otherwise require an explicit new session/manual recovery. Local event
replay remains available to the browser in all three cases.

The standalone prototype passes **14/14** deterministic tests. It proves the
state and idempotency contract only. Spike 001's unauthenticated Codex and
Cursor ACP observations are consumed as credential-free capability fixtures;
the auth-gated provider sessions did not prove load, resume, or authenticated
history recovery. This was the evidence boundary before the later
authenticated qualification.

## Current authenticated qualification update

The later 2026-08-30 qualification supersedes the original provider-auth gate
for the tested installations. Both Codex and Cursor completed session load
after provider restart through the shared ACP path, alongside initialization,
streaming, cancellation, and standard local HTTP MCP injection. This confirms
the provider-backed recovery path for those tested builds; the deterministic
14-test fixture remains the authority for crash, generation, idempotency, and
pending-interaction safety semantics. Physical HA architecture and final
packaged-provider restart evidence remain release work.

## Scope and evidence boundary

Required inputs were read before implementation:

- Spike 001's ACP contract normalizer, TypeScript SDK harness, fixture agent,
  fixture output, package lock, and provider output;
- Spike 002's auth state machine and redaction/Ingress contracts;
- `docs/technical-design.md`, especially its process-manager, event-projection,
  permission, persistence, and failure-handling sections.

The Spike 001 fixture uses `@agentclientprotocol/sdk@1.4.0`,
`@agentclientprotocol/codex-acp@1.7.0`, `tsx@4.23.12`, TypeScript `7.0.2`, and
Node `v26.0.0` in its recorded ARM64 run. Its `node_modules` directory is not
present, so this spike does not install generated dependencies or mutate Spike
001. The narrow capability copy in
[`fixtures/provider-capabilities.json`](../../spikes/006-session-recovery/fixtures/provider-capabilities.json)
contains no credentials.

The executable fixture was run with Node `v26.0.0` using exactly:

```sh
node --version
node --test spikes/006-session-recovery/recovery.test.mjs
```

No package-manager install, provider launch, login, logout, or network command
was needed for the proof.

No Codex or Cursor process was started for this spike. No login, logout,
credential-store access, browser interaction, network request, or authenticated
provider session was performed. The model is in-memory and JSON-snapshot
shaped; its clock and IDs are deterministic test values, not a claim about
production storage implementation.

Artifacts:

- [`recovery.mjs`](../../spikes/006-session-recovery/recovery.mjs) — store,
  state machine, process lifecycle, browser contract, reconciliation, and
  schema migration.
- [`recovery.test.mjs`](../../spikes/006-session-recovery/recovery.test.mjs) —
  14 executable fixtures covering all requested crash/recovery cases.
- [`fixtures/provider-capabilities.json`](../../spikes/006-session-recovery/fixtures/provider-capabilities.json)
  — narrow Spike 001 capability evidence.
- [`README.md`](../../spikes/006-session-recovery/README.md) — standalone
  rerun instructions and dependency boundary.

## Official ACP evidence

Current official ACP documentation changes the recovery design in an important
way: [`session/resume` is stabilized](https://agentclientprotocol.com/announcements/session-resume-stabilized)
(published 2026-04-22). It reconnects to an existing session without replaying
conversation history, unlike `session/load`. This is the correct primitive for
an agent that can restore context but cannot return its history. The app should
negotiate both capabilities rather than treating `loadSession` as a complete
recovery guarantee.

The ACP [`session/close` method is stabilized](https://agentclientprotocol.com/announcements/session-close-stabilized)
and can cancel active work/free session resources without killing the whole
ACP process. Use it during explicit session close when advertised; process
termination remains the crash fallback. [`session/list` is also stabilized](https://agentclientprotocol.com/announcements/session-list-stabilized),
which can help discover provider sessions but does not make them the app's
browser-history authority.

The official [TypeScript SDK documentation](https://agentclientprotocol.com/libraries/typescript)
describes `@agentclientprotocol/sdk` and recommends the fluent `agent()` and
`client()` APIs for new code; older `AgentSideConnection`/
`ClientSideConnection` classes are deprecated. Spike 001's fixture is useful
wire evidence, but future production code should pin and test the current
fluent SDK surface.

## Recovery authority rules

| Data or decision | Authority | Rule |
|---|---|---|
| Browser transcript/activity replay | Local per-session event log | Immutable, contiguous sequence; replay only events after the browser's acknowledged sequence. |
| Provider model context | Provider ACP session | Recover with `session/load` or `session/resume`; never post local prompts again automatically. |
| Process liveness and ownership | Backend process manager | Exactly one running ACP subprocess for a conversation; process generation prevents stale events. |
| Turn lifecycle | Backend session row plus provider terminal event | Backend records interruption on crash; provider completion is accepted only from the current process/turn. |
| Permission/elicitation answer | Authenticated browser command plus originating ACP request | Never auto-approve on disconnect, timeout, restart, or browser reconnect. Orphan old requests after the ACP connection dies. |
| Command execution | Durable command idempotency record | A duplicate command ID returns the original result; a new command with a stale expected sequence is rejected. |
| Account/authentication | Provider auth state machine from Spike 002 | Recovery never treats a browser snapshot or local event as credentials/account proof. |
| Upgrade compatibility | Snapshot schema version and immutable events | Migrate fields forward; do not rewrite historical payloads; reject newer unknown schemas. |

## Storage contract

The model's JSON-shaped top-level snapshot is:

```text
schemaVersion, appVersion, clock, nextId
sessions, events, appEvents, commands, interactions, processes
```

Production should store the equivalent records transactionally (SQLite is the
technical-design choice). Required fields are:

| Record | Required fields and purpose |
|---|---|
| `sessions` | `sessionId`, `provider`, `providerSessionId`, `cwd`, `state`, `turnState`, `activeTurnId`, `lastInterruptedTurnId`, `activeProcessId`, `processGeneration`, `pendingInteractionId`, `loadSupported`, `resumeSupported`, `historyState`, `lastSequence`, `updatedAt`. |
| `events` | `eventId`, `schemaVersion`, `sessionId`, `sequence`, `turnId`, `processId`, `kind`, redacted/public `payload`, `source`, `createdAt`. The `(sessionId, sequence)` pair is unique. |
| `processes` | `processId`, `sessionId`, `generation`, `state` (`running`, `stopped`, `exited`, `killed`), `startedAt`, `endedAt`, `exitReason`. |
| `interactions` | `interactionId`, `sessionId`, `kind`, `providerRequestId`, `turnId`, `processId`, public `optionIds`, `state` (`pending`, `resolved`, `cancelled`, `orphaned`), `createdAt`, `resolvedAt`, `orphanReason`. |
| `commands` | `commandId`, `sessionId`, request fingerprint, result, `createdAt`. Never persist secret command values. |
| `appEvents` | `eventId`, `schemaVersion`, `kind` (`schema.migrated`, `app.upgraded`), public payload, `createdAt`; application-scoped and outside per-session replay sequences. |

`clock` and generated IDs only make the prototype deterministic. Production
must use a database transaction or equivalent atomic compare-and-swap to
allocate the next per-session sequence and record the event. Events must not be
silently dropped or renumbered after a crash.

## Browser reconnect contract

The browser reconnects with its stable connection ID (new after a browser
reload), session ID, and last durably applied sequence:

```text
connectBrowser({ connectionId, sessionId, lastSeenSequence })

{
  connectionId,
  session: { ...publicSession, lastSequence },
  replay: {
    afterSequence: lastSeenSequence,
    throughSequence: currentSequence,
    events: [event where sequence > lastSeenSequence]
  }
}
```

The prototype rejects a sequence ahead of the current server sequence. A
production API should also return a snapshot-too-old error if events are ever
compacted; the browser then replaces its local projection from a fresh
snapshot. Event sequences are per session and contiguous from 1. The snapshot
includes a public pending/orphaned interaction projection so a reconnect does
not depend on receiving the original request again.

Browser disconnect itself is not a provider command and does not alter the
turn. The process may continue. A pending permission or elicitation remains
pending and blocks the provider; it is never answered because the browser went
away. On reconnect, the suffix replay plus current snapshot restores the
decision surface.

Mutation commands carry an `expectedSequence` and globally unique
`commandId`:

- same ID and same request fingerprint: return the first result with
  `duplicate: true`, without appending an event;
- same ID with a different request: reject `command_reuse_conflict`;
- expected sequence below current: reject `stale_command`;
- expected sequence above current: reject `future_sequence`;
- exactly current: apply once, append the resulting event, and record the
  result.

This protects permission answers and cancel requests from duplicate browser
delivery and out-of-order reconnect actions. The backend must still correlate
the resulting ACP response to the originating process, session, turn, and
provider request ID.

## Exact state transitions

### Session and turn

| Current | Event | Next | Required action |
|---|---|---|---|
| `idle` | `turn.start` | `running` | Start/reuse exactly one process and record a new turn ID. |
| `running` | provider message/tool update | `running` | Append normalized event with current process/turn IDs. |
| `running` | permission request | `running` + turn `waiting_permission` | Persist public interaction; wait for browser/provider response. |
| `running` | elicitation request | `running` + turn `waiting_elicitation` | Persist public interaction; wait; do not expose provider secrets. |
| waiting | valid `interaction.resolve` | `running` | Accept only current sequence, pending interaction, allowed option, and current process. |
| `running` | provider terminal success | `idle` + turn `completed` | Clear active turn; retain process for another turn or idle reap. |
| `running` | provider terminal failure | `idle` + turn `failed` | Preserve redacted error; clear active turn. |
| `running` | browser cancel accepted | `running` + turn `cancel_requested` | Send ACP cancellation; wait for provider terminal cancellation. |
| `running`/waiting | agent `SIGKILL` or lost process | `orphaned` + turn `interrupted` | Record exit/interruption; orphan all pending interactions; clear active process/turn. |
| `orphaned` | provider `session/load` aligned/provider-ahead | `idle` + last turn `interrupted` | Start a new process, load provider context, surface reconciliation, offer a new turn. |
| `orphaned` | provider `session/resume` succeeds | `idle` + last turn `interrupted` | Start a new process, resume provider context without history replay. |
| `orphaned` | neither load nor resume | `recovery_required` | Do not send old prompts; offer new provider session/manual recovery. |
| `orphaned` | load history local-ahead/diverged | `recovery_required` | Show discrepancy; block automatic prompt replay. |

The prototype clears `activeTurnId` after interruption and retains
`lastInterruptedTurnId` for audit/recovery. An orphaned interaction remains in
the store with `state: orphaned` and a reason; its ID is still exposed in the
public snapshot only to explain why it cannot be answered.

### Process

`startProcess` is idempotent for a session with a running process and otherwise
allocates a new monotonically increasing process generation. Provider events
from any other process ID are rejected as stale. A clean idle backend shutdown
marks the process `stopped` and leaves the session idle. A backend restart that
finds a persisted `running` process treats it as gone and applies the same
orphan transition as a crash; it never assumes a child survived the parent.

## Failure scenarios

| Scenario | Prototype behavior | Product rule |
|---|---|---|
| Browser disconnect during normal turn | No state change; provider continues | Reconnect replays suffix; pending request stays pending. |
| Browser reconnect after events | Snapshot plus `sequence > lastSeenSequence` | Apply replay exactly once by sequence; do not duplicate messages. |
| Backend restart while idle | Cleanly stopped process remains stopped; session remains idle | New process is lazy on next turn. |
| Backend restart mid-turn | Persisted running process is exited/orphaned; turn interrupted | No prompt replay and no automatic permission/elicitation response. |
| Agent `SIGKILL` mid-turn | Process `killed`; turn interrupted; pending interactions orphaned | Offer explicit recovery only after provider load/resume capability check. |
| Pending permission at browser disconnect | Remains pending | Never allow because the browser disappeared. |
| Pending elicitation at backend restart | Becomes orphaned | Original ACP request is dead; require a fresh provider request after recovery. |
| Provider load supported | New process calls load; history IDs reconciled | Provider context, not local transcript, drives the next turn. |
| Provider load unsupported, resume supported | New process calls resume; no provider history replay | Local transcript is UI-only context; provider state remains authoritative. |
| Both unsupported | `recovery_required`; no process started | Start a new session or require explicit manual recovery/summary. |
| Provider history ahead | Mark `provider_ahead`; allow provider context with UI discrepancy | Do not fabricate missing local events; optionally refresh projection from provider. |
| Local history ahead | Mark `local_ahead`; block automatic continuation | Never resend local prompts to “catch up.” |
| Histories diverge | Mark `diverged`; recovery required | Require explicit new session/manual choice. |
| Duplicate command | Return recorded result; no second event | All mutating browser commands need idempotency keys. |
| Stale/future command | Reject with current sequence | Browser must reconnect/rebase before retry. |
| Older app/schema | Add fields and append migration metadata | Keep old event payloads/schema versions intact. |
| Newer unknown schema | Reject startup | Never guess at a future event format. |

## Provider evidence and limits (original pre-authenticated run)

The provider rows below record the evidence available when this spike was
written. The current authenticated qualification update above supersedes the
load-after-restart limitation for the tested installations.

Spike 001's recorded fixture outputs show:

- Codex ACP initialized with protocol v1 and `loadSession: true`,
  `sessionCapabilities.resume/list/close/delete`, and API-key/device-code auth
  methods. `session/new` then returned `Authentication required`, so it did not
  establish an authenticated session or history load.
- Cursor ACP initialized with protocol v1 and `loadSession: true`, but the
  recorded `sessionCapabilities` exposed only `list`; `session/new` returned
  `Authentication required` with instructions to run `agent login` and
  authenticate using `cursor_login`.
- Spike 001's fixture agent exercised `session/load`, history replay, process
  crash, cancellation, permissions, elicitation, terminal, file, and normalized
  event projection. Those are deterministic fixture proofs, not provider cloud
  proofs.

The new fixture separates `loadSupported` and `resumeSupported` so a provider
adapter can map actual negotiated capabilities rather than infer them from a
single root `loadSession` flag. Cursor's recorded capability shape therefore
remains inconclusive until a pinned binary is authenticated and its
`session/load`/`session/resume` requests are exercised.

## Redaction and security considerations

- Store only public interaction metadata (`kind`, request ID, option IDs,
  session/turn/process IDs). Never persist full provider request bodies unless
  they have been explicitly redacted.
- Do not put access tokens, API keys, MCP credentials, `SUPERVISOR_TOKEN`, or
  raw auth URLs in event payloads, command fingerprints, browser replay, or
  diagnostics. The provider auth boundary and redaction rules remain those
  established by Spike 002.
- Treat ACP `session/update` text, tool output, filesystem content, and provider
  history as sensitive and potentially prompt-injection-bearing. None can
  authorize a browser command or provider recovery by itself.
- Bind command authorization to the authenticated HA Ingress principal and
  app session, even though this MVP intentionally shares sessions/credentials
  across administrators.
- Do not expose the provider process's stdin/stdout wire trace to the browser;
  diagnostics must be redacted and bounded.
- On process crash, reject in-flight permission/elicitation responses tied to
  the dead process. A late response from a prior process generation is stale.
- During a schema/app upgrade, keep a rollback/backup decision outside this
  app's event log; the product does not create automatic backups. A restored
  snapshot with provider credentials absent must require reauthentication.

## Recommended changes to `docs/technical-design.md`

This spike did not edit the technical-design file, per task scope. Before
implementation, update it as follows:

1. In §5.3, define the process record and enforce one ACP subprocess per
   conversation, with a process generation and process ID on every provider
   event. State that a parent/backend restart never assumes a child survives.
2. In §6.1/§6.2, negotiate and record `session/load` and stable
   `session/resume` independently. Prefer `session/load`, fall back to
   `session/resume`, and explicitly say that neither permits replaying local
   user prompts. Use `session/close` when advertised before reaping an idle
   session.
3. In §6.3, specify per-session sequence allocation, immutable event rows,
   reconnect suffix replay, snapshot-too-old handling, and a public snapshot
   that includes orphaned interactions.
4. In §9, make browser disconnect a non-resolution event; make ACP requests
   orphaned on process loss/restart; bind interaction responses to process,
   turn, and provider request IDs.
5. In §10, add the `schemaVersion`, process, interaction, command idempotency,
   last-interrupted-turn, and provider-history reconciliation fields listed
   above. State that provider history is model authority and local events are
   browser authority.
6. In §13, replace general crash language with the exact idle restart,
   mid-turn restart, SIGKILL, unsupported load/resume, divergence, and no-auto-
   replay rules above.
7. In §15, add deterministic recovery tests plus authenticated manual tests
   for each provider and both architectures. Keep fixture proof separate from
   provider/cloud proof.

## Manual authenticated validation checklist

These actions require a disposable provider account/key and a protected Home
Assistant test instance. They were not performed here, and no existing
credentials should be copied or inspected.

1. Build the app with a pinned ACP SDK/provider build, dedicated provider homes,
   Ingress only, and a known test `/config`; take a normal HA backup before the
   window. Verify no public app port is exposed.
2. Start Codex and Cursor through Ingress, authenticate using the previously
   validated Spike 002 browser flow, and record only redacted capability
   snapshots. Confirm actual negotiated `session/load`, `session/resume`, and
   `session/close` methods/capabilities for the pinned builds.
3. Start one turn per provider. Disconnect the browser during streaming and
   while a permission and elicitation are pending. Reconnect with an old
   sequence and verify exactly the missing suffix plus one current snapshot;
   verify no interaction is auto-answered.
4. Kill only the provider child with `SIGKILL` during a turn. Verify the process
   generation, interrupted/orphaned turn, orphaned interaction, and stale late
   command/provider-event rejection. Do not kill a production process.
5. Restart the backend while idle and verify no orphan is created. Restart it
   mid-turn and verify the same orphan transition as SIGKILL. Reconnect from a
   browser that saw events before the restart.
6. For providers with `session/load`, compare aligned, provider-ahead,
   local-ahead, and divergent histories. Confirm the next provider turn uses
   provider context and that local prompts are never silently replayed.
7. For providers with only `session/resume`, confirm resume restores model
   context without history replay and the local transcript remains a UI
   projection. For neither capability, confirm the UI requires a new session.
8. Deliver duplicate commands, commands based on an old sequence, and commands
   from a second browser connection. Verify one effect, idempotent duplicate
   result, stale rejection, and principal/session authorization.
9. Upgrade the app across the prototype schema boundary and restore an older
   snapshot. Verify migration events, immutable old event schema versions,
   unknown-future-schema refusal, and no loss/renumbering of browser events.
10. Scan logs, diagnostics, WebSocket payloads, SQLite, process arguments, and
    provider traces for credentials, raw auth URLs, MCP secrets, and Supervisor
    tokens. Revoke disposable credentials after validation.

## Accepted, rejected, and inconclusive findings

### Accepted

- Local event log as browser replay authority and provider session as model
  context authority.
- One ACP subprocess and one foreground turn per active conversation.
- Browser disconnect/reconnect suffix contract and pending-interaction safety.
- Backend restart/SIGKILL orphan transitions with no automatic prompt replay.
- Duplicate/stale/future command handling and process-generation correlation.
- Separate `session/load`, stable `session/resume`, and unsupported recovery
  paths in the deterministic state machine.
- History reconciliation and immutable schema/app upgrade model.
- Fixture coverage: 14/14 tests pass.

### Rejected design choices

- Replaying local user prompts into a new provider process to reconstruct
  context automatically.
- Treating browser reconnect, local event presence, or a stale process row as
  proof that an ACP provider session survived.
- Auto-approving pending permissions/elicitations after browser/backend loss.
- Accepting provider events or browser commands from an old process generation
  or stale sequence.
- Starting a new process for a session with an active process.
- Silently guessing at a future snapshot schema.

### Inconclusive in the original pre-authenticated run

The provider limitations listed here describe the evidence available before
the later qualification update. They remain open only where that update does
not explicitly cover the behavior.

- Authenticated Codex `session/load`/`session/resume` and history reconciliation.
- Authenticated Cursor load/resume behavior; Spike 001's Cursor capabilities
  were auth-gated and did not advertise a clear load method.
- Whether each packaged provider child survives or is intentionally reaped by
  the final Home Assistant app container during backend restart.
- Provider behavior and event ordering on both HA OS `amd64` and `aarch64`.
- Real browser reconnect timing, reverse-proxy buffering, and provider session
  close behavior.

## Rerun

From the repository root, with no dependencies or credentials:

```sh
node --test spikes/006-session-recovery/recovery.test.mjs
```

Expected result: **14 passed, 0 failed**. The fixture capability file and
prototype remain standalone under `spikes/006-session-recovery/`; no commit was
created.
