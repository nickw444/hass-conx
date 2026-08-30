# Cross-spike audit — Spikes 001–008 and authenticated qualification

Date: 2026-08-30 (Australia/Sydney)
Scope: `docs/prd.md`, `docs/technical-design.md`, and the reports and retained
artifacts for Spikes 001–008, followed by the authenticated provider
qualification snapshot. The evidence map and detailed audit below were
originally written before Spike 008 and before authenticated provider testing;
those statements are retained as a historical audit snapshot and are
superseded where the current update says so. No production files were changed.

## Verdict

The current result is **implementation-ready but not release-ready**. Spike 008
accepts the protected/default-AppArmor Home Assistant app topology: a UID-1000
backend and capability-free UID-0 providers with `NoNewPrivs=1`, complete
root-owned `/config` write authority, and isolated backend credentials and
`SUPERVISOR_TOKEN`. The app requests no `full_access`, privileged capabilities,
or host networking. The official `/api/mcp/assist` initialize/tools-list path is
proven through the Core proxy.

Authenticated Codex ACP and Cursor native ACP also passed initialization,
session creation, streaming, cancellation, load-after-restart, standard local
HTTP MCP injection, and a harmless MCP tool call for the tested installations.
Permission behavior remains provider-defined; the safe command in that run did
not emit a permission event. The implementation may proceed from the official
Ingress contract with a minimal later live smoke. Bubblewrap is optional future
hardening and not an MVP/release gate.

Release remains blocked by Cursor distribution/legal approval, exact packaged
multi-architecture qualification, final live Home Assistant smoke evidence,
and the recovery/permission guarantees. Codex API-key authentication remains
unverified. Optional `ha-mcp` remains user-supplied and nonblocking for an
official-MCP-only product. Claims from the historical rows below remain
qualified by their original evidence boundary unless this current update
explicitly supersedes them.

## Current qualification update

| Area | Current evidence | Current decision |
|---|---|---|
| Protected app topology | Protected-host Spike 008 run with default AppArmor, no `full_access`, no privileged capabilities, no host networking, UID-1000 backend, and capability-free UID-0 provider with `NoNewPrivs=1`. | Accepted candidate architecture. |
| Configuration authority | Provider writes complete root-owned `/config`, including existing mode-0644 files; synthetic create/rename/delete and symlink replacement pass. | Accepted with explicit trust acknowledgement and symlink/file-risk disclosure. |
| Backend secrets | Backend credentials and `SUPERVISOR_TOKEN` are absent from provider environment and retained diagnostics. | Accepted boundary; preserve separate identities and broker. |
| Official Home Assistant MCP | `/api/mcp/assist` initialize and `tools/list` pass through the Core proxy. | Accepted path; retain a minimal live Ingress/MCP smoke before release. |
| Codex ACP | Authenticated initialize, session, stream, cancel, load-after-restart, standard local HTTP MCP injection, and harmless MCP tool call pass with CLI `0.150.1` and `codex-acp` `1.7.0`. | Accepted for the tested installation; API-key path remains unverified. |
| Cursor ACP | Authenticated native ACP initialize, session, stream, cancel, load-after-restart, standard local HTTP MCP injection, and harmless MCP tool call pass with Agent `2026.08.25-3e8eec`. | Accepted for the tested installation; distribution/legal approval remains a release gate. |
| Permission events | Provider-defined; no event was emitted for the safe command in the qualification run. | Never promise universal prompts; disclose provider behavior and preserve exact events when present. |
| Cursor MCP fallback | Standard ACP `mcpServers` passed in the authenticated qualification. | Keep runtime-only `.cursor/mcp.json` only as a compatibility fallback if a future authenticated build requires it; never write `/config/.cursor`. |
| Optional `ha-mcp` | User-supplied secret URL and broker design remain available. | Nonblocking; official-MCP-only path must work independently. |

## Current retained-artifact audit

The untracked `docs/` and `spikes/` tree is suitable for a clean source and
findings check-in: it contains documentation, source, scripts, manifests,
lockfiles, and normalized fixtures only. It contains no real credentials,
secret URLs, Ingress tokens, browser challenge URLs, provider binaries,
archives, `node_modules`, `__pycache__`, or build/cache directories. Synthetic
values used by redaction tests remain deliberately labelled in source and
fixtures. Raw provider stdin/stdout wire traces were removed from retained
fixture output; the generators now persist only bounded tests, normalized
events, and redacted metadata.

## Historical audit snapshot (pre-Spike-008 and pre-authenticated qualification)

## Evidence map

| Finding | Classification | Evidence boundary |
|---|---|---|
| ACP v1 initialize/session/prompt/cancel/permission shape | Accepted locally | Official SDK fixture; real Codex and Cursor initialize, then both hit auth gates. |
| Codex and Cursor authenticated parity | Inconclusive | No account login, API key, browser callback, or authenticated turn was performed. |
| HA MCP broker and redaction | Accepted locally | Official MCP SDK against an in-memory mock; no Home Assistant instance contacted. |
| Official HA MCP through Supervisor proxy | Inconclusive | Current documentation and source inspection only; no protected HA app smoke test. |
| Cursor x64/arm64 process viability | Accepted for observed package | `2026.08.25-3e8eec8` ran `--version` and ACP initialize in matching Debian glibc containers. |
| Cursor in an HA app image | Inconclusive | The common/current HA base examined is Alpine/musl; no final glibc app image or HA store build exists. |
| Cursor redistribution | Blocked | Terms and OSS notice were read; neither is a redistribution grant. Written permission/counsel decision is absent. |
| Recovery/permission semantics | Accepted as application contract | Dependency-free fixture; provider behavior still requires authenticated tests. |

## Contradictions and claims stronger than evidence

1. **Spike 004 and Cursor MCP.** Spike 004’s table correctly says MCP
   acceptance after `session/new` is inconclusive, but its later prose says both
   providers “accepted” the standard `session/new.mcpServers` shape. The trace
   proves only that the payload was serialized and sent before each provider
   returned `-32000 Authentication required`; it does not prove validation,
   connection, tool discovery, or a tool call. Spike 005 documents Cursor’s
   project/user `.cursor/mcp.json` path and the team-dashboard limitation in
   ACP. The conservative resolution is:

   - classify Cursor MCP injection as **inconclusive until authenticated**;
   - keep standard ACP `mcpServers` as the first adapter attempt;
   - retain a feature-detected, runtime-only Cursor config materialization path
     under `/run/provider-config/cursor`;
   - never write `/config/.cursor`, pass an upstream secret URL, or call the
     path “required” until an authenticated Cursor test demonstrates the need.

2. **“Both providers support” language.** Spikes 001, 004 and 007 establish
   common wire and fixture contracts, not equal provider behavior. The real
   Codex package (`@agentclientprotocol/codex-acp` 1.7.0) and the installed
   Cursor Agent (`2026.07.23-e383d2b`) were unauthenticated probes. The Cursor
   packaging spike qualified a different observed package,
   `2026.08.25-3e8eec8`, only through `initialize`. Replace broad “both support”
   wording with “same request was attempted; post-auth behavior pending.”

3. **Container conclusions.** Spike 003’s Debian/Docker and bubblewrap results
   do not prove the privilege, user-namespace, AppArmor, or filesystem behavior
   of a protected HA OS app. The report is appropriately inconclusive; design
   and release documents must preserve that qualification.

4. **MCP source freshness.** Spike 004 cites Home Assistant Core `dev` source.
   That is a moving branch, not a reproducible implementation reference. The
   documented route and transport are useful current facts, but the exact Core
   version/commit and a protected-HA smoke test are required before release.

5. **Packaging wording.** The repository has no app Dockerfile. Spike 005
   examined the common/current `ghcr.io/home-assistant/base:latest` as a
   platform reference; it must not be described as a base “used by this
   project.” The observed Alpine/musl incompatibility is still a real blocker
   for that base, not proof that every HA app must use it.

## Version and source drift

- The ACP harness versions are internally consistent: SDK 1.4.0 and
  `codex-acp` 1.7.0 recur in Spikes 001, 004, 006 and 007. The lockfile brings
  `@openai/codex` 0.148.0, while the host `codex --version` probe reported
  `codex-cli 0.150.1`; those must not be conflated. The final adapter needs an
  explicit tested runtime/package manifest.
- Real Cursor evidence is split between the installed
  `2026.07.23-e383d2b` binary and the packaged
  `2026.08.25-3e8eec8` build. No authenticated claim may transfer from one to
  the other without rerunning the parity suite.
- Cursor source links vary between `prod.cursor.com/docs/...` and
  `cursor.com/docs/...`; HA Core links use the moving `dev` branch. Select
  canonical URLs, record retrieval dates, and pin source commits or release
  versions in future reruns.
- The Cursor package metadata records independently computed SHA-256 values,
  lengths, ETags and object metadata. No publisher checksum, signature,
  detached signature, or public signing key was found. An ETag is not a
  signature and the multipart-looking ETags must not be used as hashes.
- All spike research is dated 2026-08-30, but mutable installer/docs URLs and
  moving upstream branches can change after that date. A rerun must record
  response headers and the exact package/CLI versions again.

## Credential and privacy audit

No recognizable real API key, OAuth token, JWT, private key, or long bearer
credential was found in the retained Spikes 001–007 artifacts. No real
credential was read, entered, logged in with, or contacted. The deliberate
synthetic values are expected test material and should remain clearly labelled:

- Spike 001 uses values such as `Bearer abc`, `apiKey: "secret"`, and a
  `?token=abc` URL to test redaction.
- Spike 003 uses `synthetic-not-a-secret`.
- Spike 004 uses an in-memory synthetic upstream bearer and
  `Bearer local-session-capability`, with persisted values redacted as
  `[REDACTED]`.
- Spike 007’s fake MCP and ACP fixture values (`seed`, reversible test content,
  localhost URLs and placeholder paths) are synthetic.
- Cursor S3 version IDs, ETags, package URLs and SHA-256 values are distribution
  metadata, not credentials; they are also not publisher signatures.

The traces do retain local absolute paths, ephemeral localhost ports, command
paths and generated session IDs. This is not credential leakage, but it is
unnecessary host disclosure and makes snapshots non-portable. Diagnostic
exports should canonicalize paths, ports, IDs and timestamps before persistence.
Never retain the Cursor browser challenge URL as an ordinary diagnostic.

## Dependency, binary and residue audit

Within the in-scope spike directories, retained files are source, scripts,
JSON fixtures, package manifests/lockfiles and documentation. There are no
retained Cursor archives, ELF/Mach-O binaries, `node_modules`, build/cache
directories, or generated dependency trees. Package lockfiles are intentional
reproducibility inputs, not generated runtime residue. The Cursor fetch helper
downloads to a temporary location, verifies, and refuses an existing
destination; it does not check a binary into the repository.

## Reproducibility and checks performed

Safe checks run on the retained artifacts:

- `node --test spikes/002-headless-auth/auth-flow.test.mjs spikes/006-session-recovery/recovery.test.mjs` — **23/23 passed**.
- `jq -e .` over every in-scope JSON fixture, manifest, package manifest,
  lockfile and TypeScript config — **all valid**.
- `node --check` over the two `.mjs` test/source pairs — **passed**.
- `bash -n` over the retained shell probes/fetch helper — **passed**.
- File inspection found no in-scope binary/archive residue. No package was
  installed, no network or Home Assistant instance was contacted, and no
  provider login was attempted for this audit.

The retained fixture outputs have different reproducibility quality:

- Spike 006’s dependency-free test model is deterministic.
- Spike 007’s canonical fidelity fixture is suitable for stable assertions,
  although its separate real-probe JSON records a now-absent local
  `node_modules` path and is not a self-contained rerun.
- Spike 001 and Spike 004 generated traces contain dynamic session IDs,
  absolute host paths and ephemeral ports. They are valid historical evidence,
  not byte-for-byte golden files. Normalize those fields or assert semantic
  invariants in future runs.
- Re-running the TypeScript fixtures requires `npm ci` in each spike directory;
  this audit deliberately did not reinstall packages. Reruns must verify lockfile
  integrity, capture Node/npm versions, and remove `node_modules` after local
  execution when retention is not intended.

## Architectural decisions now unlocked

1. Use one application-owned normalized ACP v1 adapter contract, with explicit
   provider version/capability capture and an `unknown` event fallback.
2. Use a backend-owned MCP broker. Provider config may contain only a local
   opaque capability; upstream bearer tokens and optional `ha-mcp` secret URLs
   stay in process memory or protected secret state.
3. Run web/backend and provider processes under separate Unix identities where
   compatible; same-user environment/file scrubbing is not a security boundary.
4. Treat Cursor as a glibc-only observed runtime and make its package immutable
   and versioned, with auto-update disabled. A runtime-fetch model is a legal
   and availability fallback, not an equivalent supply-chain result.
5. Materialize Cursor MCP config only at runtime and only when the adapter’s
   authenticated capability test shows the standard ACP field is insufficient.
6. Present ACP activity as provider-reported activity, not a complete audit:
   direct ACP filesystem/terminal calls are visible to the app, but a provider
   shell can create, modify or delete files without an ACP file event. Never
   promise universal prompts, diffs, locations, rollback, or audit coverage.
7. Persist browser-visible events separately from provider session authority and
   process liveness. Pending permissions need generation, timeout, disconnect,
   orphan and idempotency states; reconnect must not silently approve or replay
   prompts.

## Release blockers

Priority P0:

- Obtain written Anysphere permission, or a project-owner-approved legal
  interpretation, covering copying/caching the proprietary Agent CLI in OCI
  images, both architectures, notices, and user account operation. If runtime
  fetch is selected, obtain a separate legal decision covering automated
  download/install and caching.
- Build and qualify the final glibc-based HA app image for amd64 and aarch64,
  including Supervisor/s6 behavior, non-root permissions, AppArmor, Ingress,
  and signed OCI provenance. No silent privileged or Alpine fallback.
- Run authenticated Codex and Cursor parity at the exact shipped builds:
  auth, session creation/load, modes, streaming, cancellation, direct `/config`
  and `.storage` activity, shell-created files, permissions, official/optional
  MCP, reconnect and recovery.

Priority P1:

- Run protected-HA MCP smoke tests for `/api/mcp/assist` and `/api/mcp`, 401,
  404, reconnect, tool listing and one disposable reversible write without
  exposing `SUPERVISOR_TOKEN`.
- Complete real disposable-account auth UX and restart/logout persistence tests
  for Codex device code/API key and Cursor browser/API key through Ingress.
- Pin the final provider package versions, Cursor artifact URLs/lengths/SHA-256,
  source commits, base-image digests and build toolchain; request upstream
  signed checksums where possible.
- Turn the recovery model into the exact SQLite migration/schema and add
  retention/redaction tests for logs, WebSocket payloads, SQLite and diagnostics.

## Exact remaining manual tests

These require project-owner credentials, a disposable HA installation, or the
protected app environment. They were not performed by this audit:

1. **Authentication:** Codex device-code completion and restart persistence;
   Codex API-key request; Cursor browser login URL/callback and restart;
   Cursor API key; status/logout; two shared admin browsers; rejection of
   non-admin users. Use isolated provider homes and never retain credentials or
   challenge URLs in fixtures.
2. **Authenticated ACP parity:** exact shipped Codex and Cursor binaries for
   `initialize`, `session/new`, mode changes, streaming updates,
   `session/load`/resume, cancellation and clean shutdown. Record negotiated
   capabilities and provider versions.
3. **Activity boundary:** direct ACP fs edit; provider shell create/modify/delete
   file; direct `.storage` edit; harmless and destructive-labelled commands;
   permission allow-once/allow-always/reject; browser disconnect while pending;
   timeout, reconnect, stale response and process kill. Confirm the UI labels
   invisible provider-side filesystem work as best-effort.
4. **MCP:** official Assist and advanced API IDs through the Supervisor proxy;
   broker 401/404/failure/reconnect; tools/list; one disposable reversible
   write; optional `ha-mcp` isolated installation. Authenticate Cursor, test
   standard `mcpServers`, then test runtime `.cursor/mcp.json` only if needed.
5. **Container/HA:** build/run signed amd64 and aarch64 images on representative
   protected HAOS hosts; verify glibc, non-root UIDs, `/config` access,
   AppArmor, Ingress source restriction, no privileged requirement, and no
   token visibility in `/proc`, logs, WebSocket, diagnostics or SQLite.
6. **Packaging lifecycle:** verify both pinned archives and CLI versions in a
   clean build; launch with auto-update disabled; prove an app-image upgrade,
   failed upgrade and whole-image rollback. Confirm notices and the legal
   approval are shipped with release metadata.

## Historical technical-design recommendations (superseded by T001)

The following recommendations were written before Spike 008 and authenticated
provider qualification. They are retained as audit provenance, but the
reconciled `docs/technical-design.md` and `docs/TASKS.md` now supersede them.
In particular, do not reintroduce a bubblewrap release gate, non-root provider
assumption, or unauthenticated MCP qualification requirement from this list.

The original recommendations were:

1. **P0 — §7.2 and §8.4 Cursor MCP qualification.** Replace any implication
   that standard `session/new.mcpServers` is accepted by Cursor with the
   evidence boundary above. Specify: attempt standard ACP config first; if an
   authenticated capability/contract test rejects or ignores it, materialize
   runtime-only `/run/provider-config/cursor`; never mutate `/config/.cursor`;
   fail closed if neither path works.
2. **P0 — §7.2 and release gate.** Add the observed Cursor requirement for a
   glibc runtime, immutable versioned package, `--disable-auto-update`, target
   architecture and verified length/SHA-256. Add written redistribution
   permission/counsel approval as a hard gate, with runtime fetch explicitly
   marked a separate legal decision rather than an assumed workaround.
3. **P0 — §7.3 and §16/release criteria.** State that “both providers pass parity” means
   authenticated tests against the exact shipped binaries, on amd64 and
   aarch64, including MCP, permission, cancellation, recovery and direct file
   activity. Separate fixture acceptance from provider acceptance.
4. **P0 — §6.3, §9 and §13 activity and permissions.** Add the Spike 007 visibility
   boundary: provider-side shell/filesystem mutations may be invisible; ACP
   events are not an audit/rollback system. Specify pending permission states
   (`pending`, `resolved`, `cancelled`, `expired`, `orphaned`), timeout,
   disconnect grace, process generation and stale-response rejection.
5. **P1 — §8.2/§8.3 MCP.** Pin the Home Assistant Core/API documentation or
   tested Core commit used for route claims; require a protected-HA smoke test
   for Assist and advanced endpoints and distinct 401/404/transport errors.
   Keep `homeassistant_api: true` separate from `hassio_api`.
6. **P1 — §10 persistence.** Adopt the recovery fields from Spike 006 in the
   actual SQLite migration: process generation/state, event sequence, pending
   interaction, command idempotency and app upgrade records. Document that
   provider history remains authoritative and prompts are never replayed as new
   prompts.
7. **P1 — §12 security and §14 diagnostics.** Add canonicalization of host paths,
   ports, IDs and timestamps in retained traces; retain only redacted metadata;
   explicitly classify synthetic fixtures and forbid browser challenge URLs,
   bearer headers, provider homes and secret MCP URLs in diagnostics.
8. **P1 — §4 packaging, §15 verification and §16 release hardening.** Add a reproducible multiarch manifest: base
   digest, provider artifact URL, expected length/SHA-256, CLI version, source
   retrieval date/commit, Node/npm lockfile and final OCI signature. Require a
   clean-package check proving no binary/dependency residue is published
   accidentally.

The root agent should make these design edits before implementation claims are
promoted from “fixture/local” to “supported MVP.”
