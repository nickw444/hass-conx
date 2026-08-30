# Home Assistant Conversational Agent — Risk-First Implementation Sequence

**Status:** Proposed high-level sequence for review; T001 completed 2026-08-30

**Scope:** MVP implementation planning

**Companion documents:** [Product requirements](prd.md), [technical design](technical-design.md), and [spike index](spikes/README.md)

## Purpose

This plan sequences work as a series of thin, demonstrable vertical slices.
It intentionally proves product value and exposes integration risk before
investing in complete persistence, polished UI, or release automation.

This is not yet the task-specification document. After the sequence is
accepted, each task will receive its own implementation brief, allowed file
scope, acceptance criteria, tests, and required evidence.

## Sequencing rules

### Commit-sized tasks

Every implementation task should:

- produce one cohesive behavior or one bounded validation result;
- fit naturally into one reviewable Git commit;
- include the tests and concise documentation needed for that behavior;
- depend only on completed tasks listed in its dependency column;
- avoid unrelated refactoring or formatting changes; and
- leave all checks available at that point passing.

If a task cannot be explained as one outcome, split it before implementation.

### Checkpoint before investment

Each validation checkpoint is a stop/go boundary. The next major phase should
not begin until the checkpoint demonstrates its stated outcome. Independent
low-cost tasks may continue, but a failed checkpoint triggers reassessment
rather than compensating with more infrastructure.

### Evidence hierarchy

Use the least expensive evidence that answers the question, but label it
honestly:

1. deterministic fixtures for application contracts;
2. real authenticated providers in disposable local workspaces;
3. production-shaped containers and broker boundaries;
4. live Home Assistant only where its behavior cannot be represented locally;
5. both physical HAOS architectures before release.

## Legend

| Marker | Meaning |
| --- | --- |
| **CP** | Critical-path implementation task. |
| **Parallel** | May proceed alongside the critical path after its dependencies. |
| **Validate** | Evidence-producing stop/go checkpoint, retained in the repository. |
| **Gate** | External/manual decision or evidence, not an implementation commit. |
| **Complete** | Task outcome is already recorded and reconciled; dependent implementation remains pending. |

## Phase 0 — Align and scaffold only what the first slice needs

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T001 | **Complete** | Reconcile authoritative architecture documentation | Remove stale pre-Spike-008 assumptions and record the accepted container, ACP, MCP, Ingress, and provider conclusions before implementation begins. | — |
| T002 | **CP** | Scaffold the application workspace | Establish small backend, frontend, and shared-contract packages with deterministic local commands; add no product behavior. | T001 |
| T003 | **CP** | Pin the initial implementation baseline | Pin Node, package manager, ACP SDK, assistant-ui, database, and test-runner versions. | T002 |
| T004 | **Parallel** | Add baseline repository checks | Add formatting, linting, type-checking, unit-test, and clean-tree CI against the scaffold. | T002, T003 |

T001 is complete. The reconciled architecture records the protected/default-
AppArmor app, UID-1000 backend, capability-free UID-0 providers with
`NoNewPrivs`, complete `/config` authority, backend-only credentials and
`SUPERVISOR_TOKEN`, official Assist MCP proof, Ingress-contract approach,
independent backend administrator authorization, authenticated Codex/Cursor ACP
qualification, Cursor MCP fallback/legal gate, unverified Codex API-key path,
and nonblocking user-supplied `ha-mcp`. Bubblewrap is explicitly deferred as
optional future hardening.

## Phase 1 — Walking skeleton: prove the delivery shape

The first slice deliberately uses a scripted agent. Its purpose is to prove
that the Home Assistant-shaped delivery path and conversation UI compose
cleanly before ACP, accounts, or persistence complicate diagnosis.

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T005 | **CP** | Create the development Home Assistant app shell | Add a protected glibc app manifest/container with Ingress, `/config`, `/data`, and no unnecessary host privileges, reusing the accepted Spike 008 topology at development fidelity. | T003 |
| T006 | **CP** | Start the minimal backend | Add configuration loading, lifecycle handling, and health/version endpoints inside the development app. | T005 |
| T007 | **CP** | Implement the Ingress proxy contract | Handle generated base paths, trusted proxy headers, direct-caller rejection, streaming-safe URLs, and external login URLs using documented Ingress behavior and proxy fixtures. | T006 |
| T008 | **Parallel** | Create the assistant-ui shell | Add the React application and a minimal external-store adapter with one static conversation. | T002, T003 |
| T009 | **CP** | Stream scripted conversation events | Add the smallest WebSocket path needed to deliver ordered scripted message events from backend to frontend. | T007, T008 |
| T010 | **CP** | Add a deterministic scripted agent | Add a fixture that emits a message, tool activity, completion, cancellation, and an error without invoking a real provider. | T009 |
| T011 | **Validate** | Validate the walking skeleton | Retain an automated Ingress-shaped demonstration proving the app loads, streams a conversation, shows activity, cancels, and rejects a direct untrusted route. | T010 |

**Stop/go V1:** If assistant-ui, Ingress base paths, or the streaming transport
cannot support this small slice cleanly, revisit the delivery architecture
before adding ACP or provider-specific work.

## Phase 2 — Real-agent slice: prove ACP portability and authentication

This phase replaces the scripted agent with both real authenticated providers
while keeping state and UI deliberately minimal.

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T012 | **CP** | Define the minimum ACP application contracts | Add versioned types for provider identity, capabilities, session identity, turn state, normalized messages, activity, and errors needed by the real-agent slice. | T011 |
| T013 | **CP** | Implement the ACP v1 connection wrapper | Add stdio JSON-RPC initialization, negotiated capabilities, bounded messages, protocol errors, and clean shutdown using the pinned SDK. | T012 |
| T014 | **CP** | Normalize the first ACP event set | Map messages, thoughts, tool activity, turn state, cancellation, and unknown updates into the existing browser event shape with source/fidelity labels. | T013 |
| T015 | **CP** | Launch one disposable provider process | Add scrubbed environment, ACP-only stdout, redacted stderr, startup timeout, and bounded process cleanup for one temporary conversation. | T013, T014 |
| T016 | **CP** | Add the provider adapter registry | Define declarative launch, version, authentication, resume, redaction, extension, and MCP hooks without branching shared services by provider. | T013, T015 |
| T017 | **Parallel** | Add the Codex launch adapter | Validate the pinned Codex and `codex-acp` versions, initialize ACP, and expose negotiated capabilities from an isolated provider home. | T016 |
| T018 | **Parallel** | Add Codex subscription authentication | Orchestrate device-code authentication, transient URL/code presentation, status refresh, provider-native persistence, and logout without exposing stored credentials. | T017 |
| T019 | **Parallel** | Add the Cursor launch adapter | Validate the pinned native Cursor Agent, initialize native ACP, isolate its home, and disable uncontrolled version drift. | T016 |
| T020 | **Parallel** | Add Cursor account authentication | Orchestrate the advertised `cursor_login` flow, transient external action, status refresh, provider-native persistence, and logout. | T019 |
| T021 | **CP** | Inject a harmless local MCP fixture | Pass one local HTTP MCP server through standard ACP `mcpServers` and record connection/tool activity for both providers without Home Assistant secrets. | T017, T019 |
| T022 | **Validate** | Validate both authenticated ACP providers | Retain real-provider evidence that both adapters authenticate, stream a prompt, cancel, load after process restart, surface activity, and call the local MCP fixture through the same application path. | T018, T020, T021 |

**Stop/go V2:** If either provider requires a fundamentally different frontend,
session model, or non-ACP execution path, revisit the equal-provider MVP before
building durable conversation infrastructure.

## Phase 3 — Home Assistant value slice: prove the product's core job

This phase proves the useful composition: a real provider, full configuration
workspace, brokered official MCP, and visible activity. It uses a synthetic
configuration tree and HA-shaped MCP fixture locally; prior Spike 008 evidence
covers the real protected mount and official MCP handshake.

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T023 | **CP** | Add the SQLite migration foundation | Add database opening, pragmas, ordered migrations, schema checks, and fail-closed behavior for unknown newer schemas. | T022 |
| T024 | **CP** | Persist minimum settings and provider state | Store trust acknowledgement, selected provider defaults, non-secret provider metadata, versions, authentication status, and capability snapshots. | T023 |
| T025 | **Parallel** | Implement restricted secret storage | Add write-only storage/deletion under the dedicated secret directory and keep secret values out of SQLite, logs, and browser responses. | T023 |
| T026 | **CP** | Enforce administrator-only authorization | Resolve trusted Ingress identity to administrator status and reject non-admin or unverifiable callers without relying on `panel_admin` alone. | T007, T024 |
| T027 | **CP** | Gate the full configuration workspace | Require the trust acknowledgement before launching an agent with complete `/config` access and disclose secrets, `.storage`, symlink, mutation, and no-rollback risks. | T024, T026 |
| T028 | **CP** | Issue session-scoped MCP broker capabilities | Create opaque local capabilities with expiry/revocation so providers receive neither `SUPERVISOR_TOKEN` nor upstream secret URLs. | T025, T027 |
| T029 | **CP** | Connect the official Assist MCP upstream | Add Supervisor-proxied initialization, discovery, health classification, and bounded reconnect for `/api/mcp/assist`. | T028 |
| T030 | **CP** | Inject the official MCP server through ACP | Supply only the local broker endpoint through standard ACP `mcpServers` and verify provider configuration contains no upstream credential. | T022, T028, T029 |
| T031 | **Parallel** | Render the minimum useful agent activity | Show provider identity, messages, MCP calls, commands, file activity, provenance, and raw expandable details using the events already available. | T014, T030 |
| T032 | **CP** | Automate the core Home Assistant workflow | Drive each real provider against a synthetic `/config` tree and HA-shaped MCP fixture to inspect configuration, call a tool, make one named edit, and explain the result. | T027, T030, T031 |
| T033 | **Validate** | Validate the Home Assistant value proposition | Retain evidence that both providers complete the same core workflow while backend secrets remain absent from provider environment, events, logs, and diagnostics. | T032 |

**Stop/go V3:** If the common ACP path cannot combine direct configuration
work and brokered Home Assistant context safely and intelligibly, stop before
building full persistence or polished product surfaces. This is the principal
direction-validation checkpoint.

## Phase 4 — Make the proven slice durable and safe to resume

Only after V3 passes do we invest in the complete session, event, interaction,
and recovery model.

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T034 | **CP** | Complete the durable domain contracts | Add conversation, process-generation, event-sequence, pending-interaction, command-idempotency, recovery, and health states not needed by the thin slices. | T033 |
| T035 | **CP** | Add the durable runtime schema | Add migrations for conversations, events, processes, pending interactions, idempotent commands, MCP connections, and app-level upgrade records. | T023, T034 |
| T036 | **CP** | Implement durable repositories | Add bounded storage operations for conversations, ordered events, processes, interactions, commands, and connection metadata. | T035 |
| T037 | **CP** | Upgrade WebSocket replay and command safety | Add snapshots, missing-suffix replay, expected sequence/state, idempotency keys, stale-tab rejection, and command size limits. | T009, T036 |
| T038 | **CP** | Harden the ACP process manager | Add one process per active conversation, monotonically increasing generations, idle limits, graceful close, bounded reaping, and current-generation event enforcement. | T015, T034, T036 |
| T039 | **CP** | Implement conversation CRUD | Create, list, retrieve, rename, archive, and locally delete conversations with provider/model/mode metadata. | T036, T038 |
| T040 | **CP** | Create and restore provider sessions | Create ACP sessions with `/config` as `cwd` and load/resume provider context without replaying old prompts as new input. | T030, T038, T039 |
| T041 | **CP** | Run one ordered foreground turn | Enforce one prompt at a time per conversation, explicit busy behavior, ordered persistence, and terminal turn state. | T037, T040 |
| T042 | **CP** | Handle cancellation and process failure | Add cooperative cancellation, timeouts, crash interruption, generation rollover, and orphaning of process-bound work. | T038, T041 |
| T043 | **CP** | Implement the permission lifecycle | Persist provider choices, bind responses to process generation, preserve bounded pending state, reject stale responses, and never silently approve. | T037, T041, T042 |
| T044 | **Parallel** | Implement the elicitation lifecycle | Handle form and URL elicitations separately from permissions without persisting challenge URLs or credentials. | T037, T041, T042 |
| T045 | **CP** | Recover safely after backend restart | Mark running work interrupted, orphan old interactions, reconcile event/provider history, and resume only on explicit user action. | T040, T042, T043, T044 |
| T046 | **Validate** | Validate durability and interaction recovery | Retain tests proving refresh/replay, duplicate-command rejection, cancellation, pending permission reconnect, process crash, and backend restart do not duplicate prompts or approve actions. | T045 |

**Stop/go V4:** Recovery failures are allowed to narrow supported behavior, but
not to produce ambiguous or unsafe state. Do not proceed to UX polish while a
stale browser can act on the wrong process generation.

## Phase 5 — Turn the proven system into the MVP experience

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T047 | **CP** | Build onboarding and trust acknowledgement | Present administrator scope, provider data sharing, full `/config` authority, physical MCP effects, and the no-rollback model. | T027, T046 |
| T048 | **Parallel** | Build conversation navigation | Add conversation creation, listing, provider identity, rename, archive, delete, and honest empty/loading/error states. | T039, T046 |
| T049 | **CP** | Build the reconnectable conversation thread | Render durable messages, incremental output, turn status, cancellation, reconnect, and replay without duplicate events. | T037, T041, T042, T046 |
| T050 | **Parallel** | Build the complete activity timeline | Add provenance-aware cards for tools, commands, terminal output, file changes, plans, unknown events, incomplete-audit disclosure, and expandable raw details. | T031, T049 |
| T051 | **CP** | Build permission and elicitation controls | Render provider-supplied choices/forms/URLs with pending, resolved, expired, cancelled, and orphaned states. | T043, T044, T049 |
| T052 | **Parallel** | Build provider and authentication settings | Add provider/model/mode selection, capability-aware controls, subscription login/status/logout, and version diagnostics. | T018, T020, T024, T046 |
| T053 | **Parallel** | Build MCP and diagnostic settings | Show official MCP health, provide bounded redacted export, and expose versions/state without secret values. | T025, T029, T046 |
| T054 | **Parallel** | Add Home Assistant-specific activity cards | Add friendly renderers for recognized entities, actions, automations, traces, MCP results, and available file diffs while retaining technical details. | T050 |
| T055 | **Validate** | Validate the feature-complete MVP journey | Demonstrate onboarding through resumed conversation for both providers, including one edit, one MCP call, cancellation, and a permission or explicit no-permission disclosure. | T047, T048, T049, T051, T052, T053, T054 |

## Phase 6 — Optional capabilities, packaging, and release evidence

These tasks do not precede proof of the core product. Optional features remain
off the critical path unless the release scope explicitly requires them.

| ID | Marker | Task | Commit-sized outcome | Depends on |
| --- | --- | --- | --- | --- |
| T056 | **Parallel** | Add the unverified Codex API-key path | Add write-only key submission, process injection, removal, mocked ACP coverage, and an explicit unverified label without claiming real-account success. | T025, T017, T052 |
| T057 | **Parallel** | Add optional `ha-mcp` | Add write-only URL management, brokered Streamable HTTP health, registration as a second logical ACP server, and official-MCP-only degradation. | T025, T028, T030, T053 |
| T058 | **CP** | Harden the production process topology | Run backend UID 1000 and capability-free UID 0 providers with `NoNewPrivs`, scrubbed environments, isolated homes, restricted backend secrets, and protected AppArmor defaults. | T038, T055 |
| T059 | **CP** | Package the pinned Codex runtime | Install immutable Codex CLI and ACP adapter artifacts for both architectures with version and integrity checks. | T017, T058 |
| T060 | **Parallel** | Package the pinned Cursor runtime | After legal clearance, install immutable Cursor glibc artifacts for both architectures with version/digest checks and auto-update disabled. | T019, T058, G1 |
| T061 | **Parallel** | Define backup and upgrade behavior | Exclude credentials and application secrets, preserve eligible history, run migrations at startup, and document reauthentication after restore. | T025, T035, T058 |
| T062 | **CP** | Add reproducible multi-architecture builds | Build `amd64` and `aarch64` images from pinned inputs, run smoke checks, generate SBOM/provenance data, and sign release images. | T004, T059, T060, T061 |
| T063 | **CP** | Qualify the integrated release candidate | Run exact packaged-provider parity, workspace/MCP workflows, leakage scans, stale interactions, restarts, upgrades, failure paths, and resource bounds. | T055, T056, T057, T062 |
| T064 | **CP** | Publish capability and trust documentation | Publish verified provider differences, optional/unverified status, supported versions, full configuration authority, recovery limits, and live HAOS evidence. | T063, G5 |

## External and manual gates

These are visible decision/evidence gates, not implementation commits. They
must not block unrelated eligible tasks.

| Gate | Needed by | Decision or evidence |
| --- | --- | --- |
| G1 — Cursor distribution approval | T060 | Obtain project-owner-approved legal clearance to bundle the pinned Cursor runtime or perform a pinned runtime download. Runtime fetching is not assumed to resolve distribution rights. |
| G2 — Physical HAOS access | G5 | Secure representative `amd64` and `aarch64` Home Assistant OS systems for final combined-image qualification. |
| G3 — Disposable official MCP target | G5 | On a live HA instance, permit one safe Assist read and one reversible action against a disposable helper; no physical device is required. |
| G4 — Optional `ha-mcp` URL | Optional portion of T062/G5 | Enter the secret URL directly into the app and use disposable read/reversible-write targets. Its absence does not block the official-MCP-only product. |
| G5 — Live Home Assistant release matrix | T064 | On the G2 systems, run the minimal Ingress/WebSocket/admin check plus both providers, `/config`, official MCP, restart, upgrade, and architecture smoke workflows; retain only redacted evidence. |
| G6 — Real Codex API-key account | Future verification | No credential is available. T056 remains structurally tested and explicitly unverified; this does not block the agreed MVP. |

## Critical path

```text
T001 -> T002 -> T003 -> T005 -> T006 -> T007 -> T009 -> T010 -> T011
     -> T012 -> T013 -> T014 -> T015 -> T016
     -> [T017 -> T018] and [T019 -> T020] -> T021 -> T022
     -> T023 -> T024 -> T026 -> T027 -> T028 -> T029 -> T030
     -> T032 -> T033
     -> T034 -> T035 -> T036 -> T037 -> T038 -> T039 -> T040
     -> T041 -> T042 -> T043 -> T045 -> T046
     -> T047 -> T049 -> T051 -> T055
     -> T058 -> T059 -> T062 -> T063 -> G5 -> T064
```

The major parallel lanes are:

- baseline checks T004 while the walking skeleton is built;
- assistant-ui shell T008 alongside the backend shell;
- Codex T017–T018 and Cursor T019–T020 in parallel;
- secret storage T025 and minimal activity UI T031 alongside the HA slice;
- elicitation T044 alongside permission/recovery work;
- product surfaces T048, T050, and T052–T054 as their contracts stabilize;
- optional Codex API-key and `ha-mcp` work T056–T057 after the core MVP journey
  is already proven.

## Validation milestones

| Milestone | Checkpoint | What must be visibly true |
| --- | --- | --- |
| M1 — Delivery shape | T011 | A conversation-shaped experience streams through an Ingress-shaped route and rejects direct access. |
| M2 — Provider portability | T022 | Both authenticated providers use the same ACP-facing application path for stream, cancel, restart/load, and MCP fixture contact. |
| M3 — Core product value | T033 | Both providers combine configuration inspection/editing with brokered HA-shaped MCP context without receiving backend secrets. |
| M4 — Safe durability | T046 | Reconnect, duplicate commands, pending decisions, process loss, and backend restart have deterministic safe outcomes. |
| M5 — Feature-complete MVP | T055 | The administrator can complete the useful end-to-end journey through the product UI with either provider. |
| M6 — Release candidate | T063 | Exact packaged binaries and both images pass parity, security, upgrade, and failure-path checks. |
| M7 — Technical preview | T064, G5 | Live HAOS evidence and published capability/trust claims agree. |

## Explicitly deferred or excluded

Do not introduce these into MVP task specifications unless product scope
changes:

- bubblewrap or another nested provider sandbox as a release requirement;
- automatic backups, checkpoints, Git initialization, commits, or rollback;
- non-admin, per-user, or multi-tenant credentials and conversations;
- support for arbitrary ACP providers beyond Codex and Cursor;
- automatic installation, upgrade, or administration of `ha-mcp`;
- a general browser IDE, terminal product, or complete filesystem audit;
- claiming real Codex API-key validation without an authenticated test; or
- requiring optional `ha-mcp` before the official-MCP-only journey works.

## Next planning step

After this sequence is approved, specify tasks one at a time. Start with T001
and preserve every validation checkpoint as an explicit opportunity to stop,
narrow scope, or change direction before committing to the next investment.
