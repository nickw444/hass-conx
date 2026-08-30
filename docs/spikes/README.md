# Spike index

Cross-spike audit date: 2026-08-30 (Australia/Sydney). The initial audit
covers Spikes 001–007; Spike 008 and the authenticated provider qualification
were completed afterward. Historical rows in the individual reports retain
their original evidence boundaries; the current qualification below is the
source for implementation decisions.

## Status dashboard

| Spike | Question | Evidence-backed result | Release status | Primary artifacts |
|---|---|---|---|---|
| 001 ACP provider parity | Can one ACP v1 client drive Codex and Cursor? | Shared ACP v1 shape and fixture lifecycle pass. Authenticated qualification also passed initialize, session creation, streaming, cancellation, load-after-restart, standard local HTTP MCP injection, and a harmless MCP tool call for the tested installations. | **Accepted for tested provider builds; multi-architecture release parity remains open.** | [report](001-acp-provider-parity.md), [fixture](../../spikes/001-acp-provider-parity/fixtures/fixture-run.json), [source](../../spikes/001-acp-provider-parity/src) |
| 002 Headless auth | Can admin-only Ingress expose provider authentication safely? | Authenticated Codex subscription and Cursor account login completed through the qualified provider paths; isolated-home and redaction rules remain required. Codex API-key authentication is unverified. | **Accepted for tested subscription paths; API-key and final Ingress UX remain open.** | [report](002-headless-auth.md), [tests](../../spikes/002-headless-auth/auth-flow.test.mjs) |
| 003 Container security | Can provider credentials and sandboxes be isolated in an HA app? | Spike 008 protected-host evidence accepts the protected/default-AppArmor topology, UID-1000 backend, capability-free UID-0 provider with `NoNewPrivs`, complete `/config` write access, and backend credential/token isolation. Bubblewrap remains unavailable. | **Accepted candidate topology; bubblewrap is optional future hardening.** | [report](003-container-security.md), [probe](../../spikes/003-container-security/probe.sh), [Spike 008](008-protected-ha-app.md) |
| 004 HA MCP integration | Can official/optional HA MCP be brokered without exposing credentials? | Broker fixture, protected-host official `/api/mcp/assist` initialize/tools-list, authenticated standard local HTTP MCP injection, and harmless MCP tool call pass for the tested providers. Optional `ha-mcp` remains user-supplied and nonblocking. | **Accepted for the official path and tested providers; final live release smoke remains open.** | [report](004-ha-mcp-integration.md), [fixture](../../spikes/004-ha-mcp-integration/fixtures/mcp-run.json), [broker](../../spikes/004-ha-mcp-integration/src) |
| 005 Cursor packaging | Can Cursor Agent be shipped reproducibly on Linux amd64/aarch64? | Observed pinned x64/arm64 packages run ACP initialize in glibc containers. The common HA base examined is musl; independent hashes are not publisher signatures. Redistribution permission is unresolved. | **Not release-ready; legal blocker.** | [report](005-cursor-packaging.md), [metadata](../../spikes/005-cursor-packaging/cursor-agent-artifacts.json), [verifier](../../spikes/005-cursor-packaging/fetch-agent.sh) |
| 006 Session recovery | Can local history, provider context and process recovery remain distinct? | Dependency-free recovery model and 14-test fixture pass; authenticated provider load-after-restart passed for the tested installations. Stale commands, orphaned permissions, and explicit resume rules remain required. | **Accepted for tested provider recovery; architecture/release restart evidence remains open.** | [report](006-session-recovery.md), [tests](../../spikes/006-session-recovery/recovery.test.mjs) |
| 007 Permission/activity fidelity | What can ACP honestly show and control? | Fixture fidelity and safety boundary pass. Authenticated qualification confirms provider activity remains provider-defined; the safe test command emitted no permission event. | **Accepted safety boundary and tested behavior; universal permission/audit claims remain rejected.** | [report](007-permission-fidelity.md), [fixture](../../spikes/007-permission-fidelity/fixtures/fidelity-run.json), [harness](../../spikes/007-permission-fidelity/src) |
| 008 Protected HA app | Can the remaining HA OS boundary tests be run reproducibly? | Protected-host 0.1.4 confirms the protected/default-AppArmor topology, capability-free UID 0 provider writes to complete root-owned `/config`, backend UID 1000 and credential/token isolation, official Assist MCP initialize/tools-list, and no need for full access, privileged mode, or host networking. | **Accepted candidate topology; minimal live Ingress smoke and optional marker hygiene remain.** | [report](008-protected-ha-app.md), [local app package](../../spikes/008-protected-ha-app) |

## Overall gate

The cross-spike result is **implementation-ready but not release-ready**. The
architecture is sufficiently defined to proceed with the risk-first task
sequence. Release still requires Cursor distribution/legal approval, a pinned
glibc-based signed two-architecture app image, exact packaged-provider parity,
minimal live Home Assistant Ingress/MCP/admin smoke, and the permission and
recovery guarantees described in the audit. Optional `ha-mcp` and bubblewrap do
not block an official-MCP-only MVP path.

See [cross-spike-audit.md](cross-spike-audit.md) for contradictions, evidence
limits, retained-artifact checks, blockers, remaining manual tests, and precise
technical-design edits.
