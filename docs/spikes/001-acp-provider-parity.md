# Spike 001 — ACP provider parity

Status: executable spike complete; authenticated core parity is accepted for
the tested provider installations, while final packaged multi-architecture
parity remains open.

Date: 2026-08-30 (Australia/Sydney)

## Question and original pre-authenticated conclusion

Can one TypeScript ACP client and one normalized application contract drive both
maintained Codex ACP and Cursor native ACP?

**Accepted for the stable ACP v1 baseline.** The same client process, SDK
transport, initialize request, session request shape, streaming update handler,
permission handler, terminal/file handlers, cancellation notification, and
session-load call can be used for either provider. The deterministic fixture
proves the full lifecycle through the official TypeScript SDK, including a
forced child-process crash and a subsequent load in a fresh process.

**Full provider parity remains inconclusive.** Both real CLIs initialized with
the same client and both exposed auth status, but `session/new` was correctly
gated by authentication in isolated homes. Consequently no real account was
used and real prompt, permission, shell/file, MCP, cancellation, or session
load behavior could not be exercised. Provider differences are capability and
authentication data, not a second protocol/client implementation.

## Current authenticated qualification update

The later 2026-08-30 qualification supersedes the authentication-gated
conclusion above for the tested installations. Codex CLI `0.150.1` with
`@agentclientprotocol/codex-acp` `1.7.0`, and Cursor Agent
`2026.08.25-3e8eec`, both passed authenticated ACP initialization, session
creation, streaming, cancellation, load after provider restart, standard local
HTTP MCP injection, and a harmless MCP tool call. Permission behavior remains
provider-defined; the safe command used in that run emitted no permission
event. The original fixture and unauthenticated traces remain valid historical
evidence and are not rewritten as authenticated runs. Final qualification
still requires the exact packaged binaries on both target architectures and
the release image.

## Sources

- [Official ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
  (stable package entry point is ACP v1; ACP v2 is explicitly experimental).
- [ACP protocol documentation](https://agentclientprotocol.com/).
- [Maintained `codex-acp` repository](https://github.com/agentclientprotocol/codex-acp)
  and [npm package](https://www.npmjs.com/package/@agentclientprotocol/codex-acp).
- [Cursor native ACP documentation](https://docs.cursor.com/en/cli/acp).
- [Cursor CLI MCP documentation](https://docs.cursor.com/en/cli/mcp).

The official SDK docs describe a client as `client(...).connectWith(stream,
...)`, with `ndJsonStream` for stdio and typed client handlers. Cursor's official
ACP page documents `agent acp`, newline-delimited JSON-RPC, `initialize`,
`authenticate` with `cursor_login`, `session/new`/`session/load`,
`session/prompt`, `session/update`, `session/request_permission`, and optional
`session/cancel`. The harness uses those same calls. It does not use the
archived `zed-industries/codex-acp` implementation.

## Reproducible harness

Source and package lock:

- [`spikes/001-acp-provider-parity/src/probe.ts`](../../spikes/001-acp-provider-parity/src/probe.ts)
- [`spikes/001-acp-provider-parity/src/contract.ts`](../../spikes/001-acp-provider-parity/src/contract.ts)
- [`spikes/001-acp-provider-parity/src/contract.test.ts`](../../spikes/001-acp-provider-parity/src/contract.test.ts)
- [`spikes/001-acp-provider-parity/package.json`](../../spikes/001-acp-provider-parity/package.json)
- [`spikes/001-acp-provider-parity/package-lock.json`](../../spikes/001-acp-provider-parity/package-lock.json)

Pinned direct packages:

| Package | Version |
|---|---:|
| `@agentclientprotocol/sdk` | `1.4.0` |
| `@agentclientprotocol/codex-acp` | `1.7.0` |
| `tsx` | `4.23.12` |
| `typescript` | `7.0.2` |
| `@types/node` | `26.1.0` |

Commands from the repository root (the generated `node_modules` directory is
ignored and need not be retained):

```sh
cd spikes/001-acp-provider-parity
npm ci
npm run typecheck
npm test
npm run fixture -- --out fixtures/fixture-run.json
npm run probe -- --provider codex --out fixtures/codex-run.json
npm run probe -- --provider cursor --out fixtures/cursor-run.json
```

`probe.ts --fixture` launches the same file as an ACP agent child process and
uses the official SDK on both sides. It persists only deterministic fixture
session state in `/tmp`, starts a second fixture process after sending
`SIGKILL`, then calls `session/load`. `probe.ts --provider` launches a real
provider with a fresh temporary `HOME` and `CODEX_HOME`, strips known API/token
environment variables, never calls `authenticate`, and never opens a browser.
`ACP_ALLOW_NETWORK_PROMPT=1` is an explicit opt-in to attempt a real prompt;
the default skips it to avoid account/network/model side effects.

The HTTP MCP entry in the probe is deliberately `http://127.0.0.1:9/...` with
no secret headers. It is used to verify that a standard `mcpServers` payload is
constructed, not to claim a connected Home Assistant MCP server.

## Environment and installed runtimes

The captured runs were made on:

```text
Node v26.0.0
npm 11.12.1
platform darwin / arm64
codex-cli 0.150.1 (/opt/homebrew/bin/codex)
Cursor agent 2026.07.23-e383d2b (/Users/nickw/.local/bin/agent)
Cursor cursor-agent 2026.07.23-e383d2b (/Users/nickw/.local/bin/cursor-agent)
```

No Linux amd64/aarch64 runtime or Home Assistant OS host was available in this
environment. That architecture/app-container validation remains outstanding.

## Capability matrix (original pre-authenticated run)

The matrix below records the unauthenticated evidence captured by this spike.
The current authenticated qualification is recorded above and supersedes its
provider rows for the tested installations; fixture rows remain valid.

`passed` means observed against a real provider. `fixture-passed` means the
same SDK client and handlers exercised the protocol with a deterministic ACP
agent. `blocked-auth` means the provider returned an authentication error
before the operation. `inconclusive` means the operation was not honestly
distinguishable after that gate.

| Capability / workflow | Codex ACP 1.7.0 | Cursor native ACP 2026.07.23-e383d2b | Evidence / difference |
|---|---|---|---|
| `initialize`, protocol v1 | passed | passed | Same request; both selected protocol `1`. |
| Authentication status surface | passed | passed | Codex advertises `api-key`, `chat-gpt-device-code`; Cursor advertises `cursor_login`. IDs/descriptions are provider-specific. |
| `session/new` | blocked-auth | blocked-auth | Both returned JSON-RPC `-32000 Authentication required`. Cursor included login guidance in `error.data`; Codex did not. |
| Prompt streaming | fixture-passed; real skipped | fixture-passed; real skipped | Fixture emitted message/thought chunks and `end_turn`; no model/account call was made. |
| Cancellation | fixture-passed | fixture-passed | Fixture sent `session/cancel` while a prompt was pending and returned `stopReason: cancelled`. Real provider requires auth. |
| Permission request/options/response | fixture-passed | fixture-passed | Fixture surfaced `allow_once` and `reject_once`, selected `allow-once`, and persisted requested/resolved events. Real provider requires auth. |
| Shell/terminal events | fixture-passed | fixture-passed | Fixture exercised all `terminal/create`, `output`, `wait_for_exit`, `release` calls plus normalized terminal lifecycle. |
| File events | fixture-passed | fixture-passed | Fixture exercised `fs/read_text_file` and ACP edit tool locations, projecting `file.changed`. |
| `session/load` / reconnect | fixture-passed | fixture-passed | Fixture advertised `loadSession`, was killed, restarted, and loaded the same session with history replay. Both real providers advertise `loadSession`; authenticated validation remains outstanding. |
| Standard HTTP MCP injection | fixture-passed | fixture-passed | Fixture observed the stable logical name and HTTP config. Real provider request was sent but auth blocked `session/new`; result is inconclusive. |
| MCP transport capability | HTTP | HTTP + SSE | Real initialize difference; Codex advertises `acp:false,http:true,sse:false`; Cursor advertises `http:true,sse:true`. |
| Session capabilities | resume/list/close/delete/additionalDirectories/subagents | list | Codex advertises a materially richer set; Cursor only advertised `list` in this run. |
| Modes/config options | unknown (session blocked) | unknown (session blocked) | Fixture supports a sample `agent` mode; provider validation needs auth. |
| Process crash/reconnect | fixture-passed | fixture-passed | Provider-neutral process manager behavior; real provider reconnect/load needs auth. |

Real initialize results and redacted provider test summaries are in:

- [`fixtures/codex-run.json`](../../spikes/001-acp-provider-parity/fixtures/codex-run.json)
- [`fixtures/cursor-run.json`](../../spikes/001-acp-provider-parity/fixtures/cursor-run.json)

The complete deterministic fixture trace is in:

- [`fixtures/fixture-run.json`](../../spikes/001-acp-provider-parity/fixtures/fixture-run.json)

The probe's temporary wire recorder redacted known authorization/API/token/
secret keys and URL query credentials, but raw provider wire payloads are not
retained in the checked-in fixtures. Dynamic fixture IDs and absolute paths in
the historical normalized results are expected and are not protocol values.

## Normalized internal contract proposal

ACP remains the provider protocol and provider-specific data remains under
diagnostic metadata. The application event store should persist an envelope:

```ts
type NormalizedEvent = {
  sequence: number;       // strictly increasing per application session
  sessionId: string;      // application session ID, with provider ID separately stored
  kind: NormalizedKind;   // stable application vocabulary
  data: Record<string, unknown>;
  rawMeta?: Record<string, unknown>; // redacted, expandable diagnostics only
};
```

The proposed `kind` vocabulary is:

```text
message.delta, thought.delta,
tool.started, tool.updated, tool.completed,
file.changed, plan.updated,
terminal.started, terminal.output, terminal.completed,
permission.requested, permission.resolved,
elicitation.requested, elicitation.resolved,
turn.state, session.capabilities, activity.unknown, error
```

Mapping rules in `src/contract.ts`:

| ACP input | Normalized event |
|---|---|
| `agent_message_chunk` / `user_message_chunk` | `message.delta` with `role`, text, and `messageId` |
| `agent_thought_chunk` | `thought.delta` |
| `tool_call` / `tool_call_update` | `tool.started`, `tool.updated`, or `tool.completed` from status |
| edit tool locations | additional `file.changed` event; keep the tool event too |
| `plan`, `plan_update`, `plan_removed` | `plan.updated` with update type and entries |
| client terminal RPCs | `terminal.*` events generated by the client adapter |
| permission/elicitation request and resolution | paired interaction events with provider options preserved |
| unknown update | `activity.unknown` retaining redacted raw details |
| prompt response | `turn.state` with `stopReason` |

Every event receives a monotonic sequence before persistence. On browser
reconnect, replay a snapshot plus events after the acknowledged sequence.
Unknown ACP updates must remain visible as generic activity. Do not make the
frontend parse raw ACP or infer success from a request being sent; use the
provider response/update and explicit turn state.

Provider adapter responsibilities should be limited to launch/version/auth
bootstrap, capability interpretation, and MCP materialization where a provider
cannot consume standard `session/new.mcpServers`. The frontend consumes only
the normalized event/state contract. Auth method IDs, capabilities, error
details, and unsupported operations remain negotiated data displayed honestly.

## Results by test

### Fixture run

The fixture run passed all requested protocol-shape checks:

```text
initialize, authStatus, sessionNew, mcpInjection,
promptStreaming (15 updates), permission, shellTerminal,
fileEvents, elicitation, cancellation, processCrash,
sessionResumeLoad
```

Observed normalized kinds included `thought.delta`, `plan.updated`,
`message.delta`, `tool.started`, `tool.completed`, `file.changed`,
`permission.requested`, `permission.resolved`, `terminal.started`,
`terminal.output`, `terminal.completed`, `elicitation.requested`, and
`elicitation.resolved`.

### Codex real run

The same client initialized `@agentclientprotocol/codex-acp` and observed:

```text
agentInfo: @agentclientprotocol/codex-acp / Codex / 1.7.0
protocolVersion: 1
session/new: -32000 Authentication required
```

The ACP auth surface was present with API-key and ChatGPT device-code methods.
No authentication call was made. MCP and subsequent lifecycle tests are
inconclusive because Codex gates `session/new` first.

### Cursor real run

The same client initialized `/Users/nickw/.local/bin/agent acp` and observed:

```text
protocolVersion: 1
authMethods: cursor_login
session/new: -32000 Authentication required
error.data.message: Authentication required. Please run 'agent login' first,
then call authenticate() with methodId 'cursor_login'.
```

No authentication call was made. Cursor MCP and subsequent lifecycle tests are
inconclusive because `session/new` is gated first.

## Original blockers and manual validation (before later qualification)

The authentication-gated items below are retained as historical provenance.
The current qualification update above records which core provider checks have
since passed; final packaged multi-architecture checks remain outstanding.

No blocker remains for the shared client shape or normalized contract. The
following manual/secret-enabled validation is still required before claiming
the PRD's full parity gate:

1. In a disposable, authenticated test account, create an isolated provider
   home for Codex and complete the ACP-advertised `chat-gpt-device-code` flow
   (or select the officially supported API-key method). Confirm the browser
   receives only a redacted auth status/elicitation and that credentials remain
   in the provider home.
2. In a separate disposable Cursor home, complete the provider's documented
   `agent login` flow, then call ACP `authenticate` with
   `{ "methodId": "cursor_login" }`. Do not put that home or token in a trace
   artifact.
3. With each authenticated process, rerun `session/new`, a short prompt,
   `session/cancel`, an action that triggers permission options, a direct file
   edit, and `session/load` after process restart. Run each with and without
   the placeholder MCP replaced by a disposable MCP server, then with the
   official Home Assistant Assist MCP endpoint.
4. Run the same matrix inside protected Home Assistant app containers on
   representative Linux `amd64` and `aarch64` hosts. Validate Codex's inner
   sandbox and Cursor binary/distribution behavior; this macOS host cannot
   substitute for that test.

The spike intentionally does not automate login, inherit credentials, call
`authenticate`, or enable a physical Home Assistant action. Mark those rows as
unverified until a controlled secret-enabled run records redacted evidence.
