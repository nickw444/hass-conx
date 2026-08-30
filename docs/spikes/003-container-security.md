# Spike 003: protected-container sandbox and credential isolation

**Status:** Original local probe was inconclusive for Home Assistant OS; Spike
008 supersedes that boundary conclusion with protected-host evidence. The
capability-free UID-0 provider topology is accepted, while bubblewrap remains
optional future hardening.
**Run date:** 2026-08-30
**Host:** macOS 26.5 arm64, Docker Desktop 4.57.0, Linux Docker Engine 29.1.3 arm64
**Probe image:** `debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171`
**Bubblewrap:** Debian package `0.8.0-2+deb12u1`

## Original decision being tested

Can Codex/Cursor receive read/write `/config` access inside a protected Home
Assistant app while Home Assistant and MCP credentials remain outside the
agent's readable process and filesystem boundary? Can Codex's Linux
`bubblewrap` command sandbox operate inside the outer app container?

## Reproduction

The executable probe is in [`spikes/003-container-security`](../../spikes/003-container-security/README.md).
It uses only the literal sentinel `synthetic-not-a-secret`.

```sh
./spikes/003-container-security/run.sh
```

The probe builds a Linux arm64 container, provides a writable `/config`, and
compares same-user and separate-user process layouts. It then attempts an
inner `bubblewrap --unshare-all` sandbox under multiple outer-container
profiles.

## Observations

| Case | `/config` write | Backend secret file | Own environment token | Token in another process |
|---|---:|---:|---:|---:|
| Same user, inherited environment | Allowed | Readable | Visible | Visible |
| Same user, scrubbed child environment | Allowed | Readable | Absent | **Visible** |
| Separate Unix user, scrubbed environment | Allowed | Unreadable | Absent | Absent |

Environment scrubbing alone is therefore not a security boundary when the
backend and agent run under the same Unix identity. The agent can inspect a
same-user peer through `/proc`, and mode `0600` files are also readable to the
same user. Running provider processes as a distinct UID materially improves
credential isolation while preserving write access to a deliberately
group-/ACL-writable `/config` mount.

Bubblewrap results (original local probe):

| Outer confinement | Result |
|---|---|
| Default Docker container | Failed to create the required namespace |
| `SYS_ADMIN`, AppArmor unconfined, seccomp unconfined | Still failed mounting `/proc` in this environment |
| Fully privileged Docker control | Succeeded |

This does **not** establish that Home Assistant OS requires a privileged app.
It establishes that nested sandboxing is sensitive to the outer kernel,
namespace, seccomp, capability, and AppArmor policy. The real protected-app
At the time of this original probe, the real protected-app test remained
release-blocking. OpenAI's current documentation likewise states
that Linux sandboxing uses bubblewrap and requires unprivileged user namespace
creation: <https://learn.chatgpt.com/docs/sandboxing>.

Home Assistant supports app-specific AppArmor profiles and an administrator-
controlled protection mode; those controls must be tested rather than disabled
by assumption: <https://developers.home-assistant.io/docs/apps/security/>.

## Resulting architecture recommendation

1. Run the web/backend service and each provider process under different Unix
   identities. Do not rely on `env -i` or `0600` alone.
2. Keep `SUPERVISOR_TOKEN`, the user-supplied ha-mcp URL, and its credentials
   only in the backend identity's memory/files.
3. Expose MCP to agents through a loopback or Unix-socket credential broker.
   The broker adds the upstream authorization material. The agent receives a
   per-session opaque capability, not the Supervisor token or secret upstream
   URL.
4. Give the provider identity only the filesystem permissions required for
   `/config`, its own provider home, its runtime MCP endpoint, and selected
   runtime directories.
5. Treat Codex/Cursor provider-native authentication caches separately: the
   corresponding provider process must necessarily be able to read its own
   account credential. The other provider and backend diagnostic paths should
   not be able to read it by default.
6. Never silently downgrade a requested provider sandbox when `bubblewrap`
   cannot initialize.

## Remaining real-host validation from the original probe

This checklist predates Spike 008. Its protected-host identity, filesystem,
and token-isolation items are superseded by the qualification update below;
physical release-image and architecture checks remain separately tracked.

Create the minimal app from this probe and run it on both a protected Home
Assistant OS `amd64` host and a protected `aarch64` host. Record:

- HA OS, Supervisor, Core, kernel, Docker/containerd and app versions;
- protection mode and exact AppArmor profile;
- user namespace sysctls and namespace creation result;
- required capabilities and seccomp/AppArmor denials;
- `/config` ownership and whether a distinct provider UID can write it;
- `bubblewrap` read-only and workspace-write behavior;
- model/control-plane networking versus command networking;
- attempts to read backend and other-provider `/proc/*/environ` and secret
  files; and
- behavior across app restart and upgrade.

The test fails if it requires disabling app protection, exposes backend MCP/HA
credentials to the provider process, or silently runs commands without the
advertised inner sandbox. A narrowly scoped custom AppArmor profile is an
acceptable candidate, but must be reviewed from the recorded denials.

## Original conclusion (before Spike 008)

**Partially accepted:** separate Unix identities plus a local credential broker
should replace the same-user/direct-token design.
**Still inconclusive and release-blocking:** Codex inner sandbox compatibility
inside an actual protected Home Assistant app on amd64 and aarch64.

## Superseding protected-app qualification

Spike 008 subsequently exercised the protected Home Assistant app topology and
accepts the implementation direction: the backend runs as UID 1000 and
provider processes as capability-free UID 0 with `NoNewPrivs=1`; the protected
default-AppArmor app grants the provider complete `/config` authority,
including root-owned files, while backend credentials, process environment,
and `SUPERVISOR_TOKEN` remain isolated. The app requests no `full_access`,
privileged capabilities, or host networking. The official Assist MCP
initialize/tools-list path also passed through the Core proxy.

This supersedes the original protected-host inconclusive/release-blocking
wording. Bubblewrap namespace startup remains unavailable in the tested
environments and is optional future hardening, not an MVP or release gate.
Provider packaging, authenticated ACP behavior, and final multi-architecture
release qualification are tracked separately.

## Rerun triggers

- Codex changes its Linux sandbox implementation.
- The HA OS kernel, app protection, AppArmor, or container runtime changes.
- The app changes UID, `/config` mapping, capability, or credential-broker
  design.
