# Spike 008 — protected Home Assistant app harness

Date: 2026-08-30
Status: **0.1.4 capless-root filesystem and isolation candidate accepted on the protected host; marker hygiene is optional follow-up**
Scope: a disposable, local-only Home Assistant app package for the remaining protected-host tests. This is not the production app and contains no Codex, Cursor, provider credentials, or provider downloads.

## Outcome

The harness is installable in the Home Assistant local-app workflow and builds
for both Home Assistant `amd64` and `aarch64` (Docker `linux/amd64` and
`linux/arm64`). It keeps protection and AppArmor enabled, maps only the
Home Assistant configuration as an intentional read/write mount, and requests
only the Core API proxy. It has no public `ports`, host networking, Supervisor
API, Docker socket, `full_access`, devices, or privileged capabilities.

The local Docker smoke tests proved:

- backend UID 1000 and capability-free provider-shaped UID 0 are distinct;
- the provider probe cannot read the backend's private synthetic fixture or
  backend process environment, and receives neither synthetic secret nor
  `SUPERVISOR_TOKEN` in its environment;
- the opt-in marker is not created by default and is created by provider UID
  0/GID 0 only when the explicit `write_marker: true` option is supplied;
- backend UID/GID 1000/1000 cannot write a root:root 0775 configuration mount,
  while capability-free provider UID/GID 0/0 can write the mount and an
  existing root-owned mode-0644 file through ordinary owner permissions;
- in a dedicated synthetic directory, the provider can directly overwrite,
  create, rename, and delete files; atomic replacement of a symlink replaces
  the symlink entry while leaving its target unchanged;
- fixed `/config/configuration.yaml` and `/config/.storage` observations
  expose only metadata and read/write booleans, never contents;
- the opt-in marker uses an fsynced temporary file and atomic no-overwrite link,
  then removes the temporary name so only the named marker persists; the safe
  result also reports the marker's UID/GID/mode without exposing its contents;
- a direct request to the container listener is rejected with HTTP 403;
- the code path for the official Core MCP `initialize`, initialized
  notification, and `tools/list` requests is read-only, body-redacting, and
  token-redacting;
- the pinned glibc image builds and runs on both target architectures.

The local Docker kernel rejected bubblewrap namespace startup. Version 0.1.4
reports the later checks as blocked by that prerequisite. This is useful
negative evidence, but bubblewrap is now optional future hardening rather than
an MVP prerequisite. The protected-host evidence covers Supervisor app schema,
Core API proxy/token injection, and the official MCP initialize/tools-list path.
It does not qualify end-to-end Ingress delivery, packaged providers, or a live
release workflow; those remain explicit manual/release checks. The
protected-host 0.1.4 run also confirmed direct root-owned mode-0644 writes and
retained backend isolation.
The protected-host 0.1.3 run remains the prior group-write baseline.

## Protected Home Assistant host evidence

The first protected-host run used app version `0.1.0` and established:

- Supervisor accepted the local app with protection and default AppArmor
  enabled, no broad privileges, no host network, and no public port;
- backend UID 1000 and provider UID 1001 both read `/config`, but neither UID
  reported it writable;
- the provider could not read the backend fixture or process environment and
  inherited neither the backend synthetic secret nor `SUPERVISOR_TOKEN`;
- the backend received `SUPERVISOR_TOKEN`, initialized the official MCP
  endpoint with protocol `2025-06-18`, and listed 32 safe tool names;
- all three bubblewrap probes failed with exit code 1; and
- Supervisor stored `write_marker: true`, but both roles incorrectly reported
  `marker_requested: false`.

The last item was a harness defect, not a Supervisor option defect. Version
`0.1.0` attempted to read `/data/options.json` only after dropping to UIDs 1000
and 1001. A root-owned, mode-0600 options file was unreadable, and the harness
silently fell back to an empty option object. Version `0.1.2` fixes this by
having the root entrypoint read and strictly validate the one non-secret
boolean, then pass only `WRITE_MARKER=true|false` to the two unprivileged
roles. The local smoke fixture now makes `options.json` root-owned and mode
0600 so this regression is covered.

The `/config` and bubblewrap failures are independent of that defect. Version
`0.1.2` adds numeric target metadata for `/config` and a bounded categorical
bubblewrap failure reason so the next protected-host run can distinguish DAC
ownership from mount policy and classify the sandbox startup denial without
exposing raw runtime errors.

The operator's subsequent protected-host `0.1.2` rerun supplied the following
safe, exact evidence:

- `/config` was `uid=0`, `gid=0`, mode `0775` from both roles;
- backend was UID/GID `1000/1000`, provider was UID/GID `1001/1001`;
- both roles could read `/config`, but neither could write it;
- with `write_marker: false`, both roles reported `marker_requested: false` and
  `marker: not_requested`;
- with `write_marker: true`, both roles reported `marker_requested: true`, the
  backend reported `provider_opt_in_pending`, and the provider reported
  `write_failed_PermissionError`;
- the backend's official Core MCP initialize succeeded with HTTP 200,
  negotiated protocol `2025-06-18`, no session header, and `tools/list`
  returned 32 tool names;
- provider/backend fixture, backend process environment, synthetic secret, and
  Supervisor token isolation all remained negative as intended; and
- all three bubblewrap probes failed with exit code 1 and categorical reason
  `permission_denied`.

This confirms option propagation is fixed and isolates the remaining
configuration failure to the provider lacking membership in the observed
root-owned group-write contract. It does not prove that supplementary group 0
is acceptable for production.

## Version 0.1.3 GID-only experiment

Version `0.1.3` changes one runtime identity property only: the provider-shaped
process remains UID/GID 1001/1001, but is launched with supplementary GID 0 and
no other supplementary groups. Both unprivileged roles also set `NoNewPrivs=1`
in addition to empty capability sets and bounding sets. The backend remains
UID/GID 1000/1000. The app continues
to request no privileged capabilities, `full_access`, host networking, Docker
access, or protection/AppArmor relaxation.

The experiment asks one bounded question: when Supervisor maps `/config` as
root:root mode 0775, does provider UID 1001 with supplementary GID 0 have the
DAC needed to author a named file while preserving created-file group
ownership? It is not a privileged-mode test and is not a
production decision. A successful marker only validates directory/file
permissions; it does not authorize unrestricted agent writes to Home Assistant
configuration.

## Protected Home Assistant host evidence — version 0.1.3

The operator completed the protected-host rerun with these safe observations;
no ingress identifiers, tokens, response bodies, or logs are retained here:

- Supervisor reported the app as `protected: true`, `apparmor: default`,
  `full_access: false`, and `privileged: []`;
- provider identity was UID/GID `1001/1001` with supplementary GID `[0]`, and
  all observed `Cap*` fields were zero;
- provider `NoNewPrivs` was `1`, `Seccomp` was `0`, and
  `Seccomp_filters` was absent/zero;
- `/config` and `/config/.storage` were root:root mode `0775`; the provider
  could read and write both directories;
- `/config/configuration.yaml` was root:root mode `0644`; the provider could
  read it but could not directly write it;
- the false-option run was clean, and the explicit opt-in run created only the
  named marker with UID/GID `1001/1001` and mode `0644`;
- official Core MCP initialization still succeeded with HTTP 200 and protocol
  `2025-06-18`; `tools/list` returned 32 tool names;
- backend/provider secret, process-environment, and Supervisor-token isolation
  remained passing;
- bubblewrap namespace startup failed with categorical reason
  `permission_denied`; the later checks were correctly reported as
  `blocked_by_namespace_startup`; and
- `/proc/sys/user/max_user_namespaces` was present with value `46449`, while
  `/proc/sys/kernel/unprivileged_userns_clone` was absent.

This is a successful result for the narrow directory DAC experiment, not proof
that the provider can safely edit every Home Assistant file. Directory write
permission controls creation, deletion, and rename. It does not grant direct
write permission to an existing root-owned mode-0644 file. An atomic
temp-file-plus-rename operation may still replace such a file because rename
is authorized by the parent directory; if the path is a symlink, replacing the
path replaces the symlink itself rather than its target. That distinction is
especially important for Home Assistant configuration paths and must be tested
only with synthetic names.

## Version 0.1.4 capless-root experiment

Version `0.1.4` replaces only the provider identity experiment. The backend
remains UID/GID 1000/1000. The provider-shaped probe runs as UID/GID 0/0 with
no supplementary groups, all inheritable/permitted/effective/bounding/ambient
capability sets empty, `securebits-noroot`, and `NoNewPrivs=1`. The app still
uses protection, default AppArmor, `full_access: false`, `privileged: []`, no
host network, and no Docker or Supervisor API access.

The root UID matches ownership of the observed root-owned `/config` inodes.
Consequently it can write an existing mode-0644 file through the owner's write
bit without `CAP_DAC_OVERRIDE`. Empty capabilities still prevent it from
bypassing permissions on the backend UID-1000 mode-0600 fixture. The separate
UID boundary also remains effective for the backend process environment in the
local Docker probe.

The entrypoint creates only
`/config/.hass-conx-spike-008-root-fs-test/`, containing fixed synthetic
root-owned mode-0644 fixtures. The provider tests direct overwrite, creation,
rename, deletion, and atomic replacement of a symlink. The entrypoint removes
that entire dedicated directory immediately after the probe, including after a
reported provider failure. It never truncates, renames, deletes, chmods, or
chowns an existing Home Assistant path. The existing opt-in marker remains the
only possible persistent test mutation.

Both local `linux/arm64` and `linux/amd64` no-marker and marker runs pass. They
confirm UID/GID 0/0, no supplementary groups, all zero capability vectors,
`NoNewPrivs=1`, direct write access to the synthetic root-owned 0644 file, all
five synthetic filesystem statuses, backend secret/process-environment
denial, provider environment redaction, marker semantics, and direct-listener
403. Atomic symlink replacement changed the directory entry into a regular
file and left the separate target unchanged, confirming the hazard rather than
making it safe automatically.

This local result accepts the capless-root layout as the simplest candidate
for protected-host validation. The protected-host result below accepts its
filesystem and credential-isolation behavior. Production adoption still needs
the normal product disclosure and permission controls for broad `/config`
authority.

## Protected Home Assistant host evidence — version 0.1.4

The operator completed a protected-host 0.1.4 run with `write_marker: true`.
The safe result established:

- backend UID/GID remained 1000/1000; provider UID/GID was 0/0 with no
  supplementary groups and a writable provider home;
- all provider capability vectors and the bounding set were zero,
  `NoNewPrivs=1`, and the host reported `Seccomp=0` with no filters;
- `/config` and `/config/.storage` were root:root mode 0775 and provider
  writable; the existing root:root mode-0644 `configuration.yaml` was directly
  writable by the provider while remaining non-writable by the backend;
- direct overwrite, create, rename, delete, and atomic symlink replacement all
  passed in the dedicated synthetic tree; the symlink entry became a regular
  file and its separate target remained unchanged;
- the provider could not read the backend mode-0600 synthetic secret or backend
  process environment and received neither the backend synthetic value nor
  `SUPERVISOR_TOKEN` in its environment;
- backend Core MCP initialization succeeded with HTTP 200 and protocol
  `2025-06-18`; `tools/list` returned 32 names and discarded its response body;
- bubblewrap namespace startup remained unavailable with
  `operation_not_permitted`; dependent checks were correctly blocked; and
- the user-namespace maximum remained 46449 while
  `unprivileged_userns_clone` was absent.

This accepts the central candidate hypothesis: capability-free UID 0 can
author existing Home Assistant configuration while the UID-1000 backend keeps
its secret, process environment, and Supervisor token isolated. Bubblewrap is
not required for that candidate.

The resulting product direction is the protected/default-AppArmor app with a
UID-1000 backend and capability-free UID-0 provider processes using
`NoNewPrivs=1`. The provider receives the complete `/config` mount, including
root-owned files. The app requests no `full_access`, privileged capabilities,
or host networking. `panel_admin` remains a sidebar-visibility setting only;
the production backend must independently verify administrator authorization
from trusted Ingress identity. Implementation may proceed from the official
Ingress contract, with only a minimal later live smoke for generated paths,
WebSocket behavior, and authorization.

The marker was not created by this run. Both roles reported `already_present`,
and its UID/GID remained 1001/1001, proving it was the marker retained from the
0.1.3 experiment. This is neither a 0.1.4 marker pass nor a filesystem failure:
the no-overwrite marker contract behaved correctly. A clean false/true marker
sequence remains optional evidence hygiene, and the temporary synthetic-tree
cleanup still requires an external path check because it is not represented in
the result JSON.

## Filesystem editing implications

Version 0.1.4 confirms locally that the capless-root provider can directly
overwrite root-owned mode-0644 files, as well as create, rename, and delete
entries in root-owned writable directories. This is the intended `/config`
authority for the product, not a general host privilege: the app still maps
only the declared Home Assistant configuration mount.

Symlinks remain an application-level hazard. Opening a symlink normally
follows its target, while atomically renaming a temporary file over a symlink
replaces the symlink entry. The synthetic test confirms the latter behavior and
that its separate target remains unchanged. Provider prompts, adapters, and UI
must not imply that an atomic save preserves symlinks; paths need explicit
resolution and policy before configuration replacement.

The 0.1.3 supplementary-GID experiment remains useful historical evidence but
is not the preferred product direction. The 0.1.4 local result makes
capability-free UID 0 the candidate for the protected-host run. Bubblewrap is
optional future hardening rather than a prerequisite for this MVP.

## Inputs and safety boundary

This preparation consumed Spikes 002, 003, 004, 005, and 006 plus the current
technical design. In particular, it carries forward the auth redaction and
Ingress rules from Spike 002, the least-privilege/protected-container findings
from Spikes 003 and 005, the official MCP endpoint and token-broker boundary
from Spike 004, and the provider/session isolation assumptions from Spike 006.

No login, logout, account switch, device-code exchange, API-key use, real
credential inspection, or provider process was performed. The only persistent
Home Assistant configuration mutation is the deliberately named marker,
created by provider UID 0 at `/config/.hass-conx-spike-008-marker`, and only
after `write_marker: true`. The fixed synthetic filesystem test tree is created
and removed within each probe run.
The local smoke script mounts temporary directories and removes them on exit.

## Official Home Assistant constraints used

The following official pages were read on 2026-08-30:

- [App configuration](https://developers.home-assistant.io/docs/apps/configuration/)
  documents `arch: amd64/aarch64`, `homeassistant_api`, `map`, `ingress`,
  `apparmor`, `panel_admin`, and the current direct-Dockerfile build model.
  Since Supervisor 2026.04.0, `build.yaml` is no longer used; this package
  intentionally has no `build.yaml`.
- [App security](https://developers.home-assistant.io/docs/apps/security/)
  says protection is enabled by default and recommends least privilege,
  AppArmor, and authenticated Ingress identity handling.
- [App presentation / Ingress](https://developers.home-assistant.io/docs/apps/presentation/)
  documents Supervisor's Ingress source `172.30.32.2`, the
  `X-Ingress-Path` base path, and HTTP/WebSocket streaming behavior.
- [App communication](https://developers.home-assistant.io/docs/apps/communication/)
  documents `http://supervisor/core/api/` and the runtime-only
  `SUPERVISOR_TOKEN` supplied by `homeassistant_api: true`.
- [Local app testing](https://developers.home-assistant.io/docs/apps/testing/)
  documents copying a local app below `/addons`, omitting the `image` key so
  Supervisor builds it locally, and the `amd64` to `linux/amd64` /
  `aarch64` to `linux/arm64` mapping.
- [Home Assistant MCP Server](https://www.home-assistant.io/integrations/mcp_server)
  and the [Core MCP HTTP source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/mcp_server/http.py)
  are the read-only protocol targets used by the probe. The endpoint exercised
  is the Assist API `/api/mcp/assist` through the app's Core proxy.

The package's `config.yaml` therefore contains:

| Setting | Value | Reason |
| --- | --- | --- |
| `arch` | `amd64`, `aarch64` | Both HA target architectures. |
| `startup` / `boot` | `application` / `manual_only` | Never auto-start a disposable test app. |
| `ingress` / `ingress_port` | `true` / `8099` | Administrator-only diagnostics UI through Supervisor. |
| `ingress_stream` | `true` | Allows the same HTTP/streaming path that future ACP UI tests need. |
| `panel_admin` | `true` | Keep the UI administrator-only. |
| `homeassistant_api` | `true` | Required to test the Core proxy/MCP path. |
| `apparmor` | `true` | Leave the Supervisor protection default enabled. |
| `map` | `homeassistant_config`, `read_only: false`, `path: /config` | Explicitly test the requested disposable `/config` write boundary. |
| `options.write_marker` | `false` | Safe default; the only configuration mutation is opt-in. |
| `backup` | `cold` | Stop before backup and avoid live test state. |
| `stage` | `experimental` | Clearly not a release app. |

No custom AppArmor file is included. The harness needs only the default
protected profile, and a guessed profile would risk widening access or making
the manual result meaningless. A future production app should introduce a
narrow, reviewed profile after the real provider image and file paths are
known.

## Artifact map

All artifacts are confined to `spikes/008-protected-ha-app/`:

| Artifact | Purpose |
| --- | --- |
| `config.yaml` | Local app metadata, protection, Ingress, Core API, map, and marker option. |
| `Dockerfile` | Pinned Debian glibc image, exact direct package versions, isolated backend identity, no provider bundle. |
| `.dockerignore` | Excludes Python bytecode from build context. |
| `entrypoint.sh` | Reads the non-secret option, prepares/cleans the fixed synthetic tree, and starts backend UID/GID 1000/1000 plus capability-free provider UID/GID 0/0. |
| `backend_server.py` | UID-1000 safe result producer, Ingress-only UI, marker observation, and Core MCP probe. |
| `provider_probe.py` | Capless UID-0 synthetic `/config`, marker, DAC/proc/environment, and bubblewrap checks. |
| `build.sh` | Builds one explicit `linux/amd64` or `linux/arm64` image. |
| `smoke.sh` | Temporary named-volume root:root 0775 no-marker/opt-in tests, JSON assertions, direct-listener check, and cleanup. |
| `findings-template.md` | Manual HA evidence template with redaction reminders. |

The package does not include `build.yaml`, Codex, Cursor, their installers,
Node, an API key, an auth token, an MCP response cache, or a downloaded
dependency tree.

## Runtime design

```text
Supervisor Ingress (authenticated admin, source 172.30.32.2)
                 |
                 v
       UID 1000 backend :8099  ---- Core proxy/MCP (only if token exists)
          |         |
       capability-free UID/GID 0/0 provider-shaped probe (0.1.4 experiment)
          +-- /config/.hass-conx-spike-008-marker (opt-in only)
          +-- /config/.hass-conx-spike-008-root-fs-test (synthetic, temporary)
          |
          +-- private backend-home synthetic fixture + private env value
          +-- DAC/proc/env checks (booleans/status classes only)
          +-- bubblewrap namespace / read-only / workspace-write checks
          +-- no Supervisor token, no backend secret, no response bodies
```

`entrypoint.sh` is PID 1 and retains its initial identity solely to prepare the
fixed fixtures, launch the roles, and clean the synthetic tree; it does not run
provider code. It launches the backend as UID/GID 1000/1000 and the
provider-shaped probe as UID/GID 0/0 with no supplementary groups, empty
capability and bounding sets, `securebits-noroot`, and `NoNewPrivs=1`. This is
the 0.1.4 candidate experiment, not a request for privileged mode. The backend gets one synthetic environment
value and keeps its fixture in `/home/backend`, outside the shared `/data` bind
mount.
This placement is intentional: Docker Desktop bind mounts can remap inode
ownership and invalidate a DAC negative control. Results and coordination
files under `/data/spike-008` contain only booleans, status classes, numeric
UID/GID values, endpoint names, and safe tool names. The synthetic value itself
is never printed or persisted in a result.

The backend rejects any request whose peer address is not exactly `172.30.32.2`.
It serves only `/` and `/result.json`, with `Cache-Control: no-store`, and
silences request logging. The local Docker test consequently receives 403 from
`127.0.0.1`; the real Supervisor source check remains manual.

The Core MCP probe reads `SUPERVISOR_TOKEN` only in backend memory. It sends
MCP protocol `2025-06-18` `initialize`, `notifications/initialized`, and
`tools/list` requests to `http://supervisor/core/api/mcp/assist`. Response
bodies are bounded, parsed only in memory for protocol version and tool names,
then discarded. Error bodies, tokens, session IDs, and raw headers are not
persisted or logged. With no token it records `not_configured` and does not
make a network request.

## Safe result schema

The UI's `/result.json` combines the two files below. It is deliberately not a
general log endpoint:

```json
{
  "backend": {
    "role": "backend",
    "uid": 1000,
    "gid": 1000,
    "synthetic_secret_held": true,
    "supervisor_token_present": false,
    "config_path": "/config",
    "config_metadata": {"uid": 0, "gid": 0, "mode": "0775"},
    "config_target_observations": {
      "/config/configuration.yaml": {"metadata": {"uid": 0, "gid": 0, "mode": "0644"}, "readable": true, "writable": false},
      "/config/.storage": {"metadata": {"uid": 0, "gid": 0, "mode": "0775"}, "readable": true, "writable": false}
    },
    "config_readable": true,
    "config_writable": false,
    "marker_requested": false,
    "marker": "not_requested",
    "official_mcp": {
      "endpoint": "http://supervisor/core/api/mcp/assist",
      "supervisor_token_present": false,
      "initialize": {"status": "not_configured"},
      "tools_list": {"status": "not_attempted"}
    }
  },
  "provider": {
    "role": "provider",
    "uid": 0,
    "gid": 0,
    "supplementary_gids": [],
    "backend_uid": 1000,
    "distinct_uids": true,
    "backend_secret_readable": false,
    "backend_process_environment": "denied",
    "backend_process_environment_readable": false,
    "provider_environment_contains_backend_secret": false,
    "provider_environment_contains_supervisor_token": false,
    "provider_home_writable": true,
    "config_path": "/config",
    "config_metadata": {"uid": 0, "gid": 0, "mode": "0775"},
    "config_target_observations": {
      "/config/configuration.yaml": {"metadata": {"uid": 0, "gid": 0, "mode": "0644"}, "readable": true, "writable": true},
      "/config/.storage": {"metadata": {"uid": 0, "gid": 0, "mode": "0775"}, "readable": true, "writable": true}
    },
    "config_readable": true,
    "config_writable": true,
    "synthetic_filesystem_test": {
      "direct_overwrite": {"status": "pass", "metadata": {"uid": 0, "gid": 0, "mode": "0644"}},
      "create": {"status": "pass", "metadata": {"uid": 0, "gid": 0, "mode": "0644"}},
      "rename": {"status": "pass", "metadata": {"uid": 0, "gid": 0, "mode": "0644"}},
      "delete": {"status": "pass"},
      "atomic_replace_symlink": {"status": "pass", "entry_is_symlink_after": false, "target_unchanged": true}
    },
    "capability_observations": {
      "status": "ok",
      "fields": {
        "CapInh": "0000000000000000",
        "CapPrm": "0000000000000000",
        "CapEff": "0000000000000000",
        "CapBnd": "0000000000000000",
        "CapAmb": "0000000000000000",
        "NoNewPrivs": "1",
        "Seccomp": "2",
        "Seccomp_filters": "1"
      }
    },
    "user_namespace_sysctl_observations": {
      "/proc/sys/user/max_user_namespaces": {"status": "present", "value": "..."},
      "/proc/sys/kernel/unprivileged_userns_clone": {"status": "absent"}
    },
    "marker_requested": false,
    "marker": "not_requested",
    "marker_metadata": {"error_class": "FileNotFoundError"},
    "bubblewrap": {
      "namespace_startup": {"status": "pass|fail|error", "reason": "bounded_category_if_failed"},
      "read_only_workspace": {"status": "pass|blocked_by_namespace_startup|fail|error", "reason": "bounded_category_if_failed"},
      "workspace_write": {"status": "pass|blocked_by_namespace_startup|fail|error", "reason": "bounded_category_if_failed"}
    }
  }
}
```

When a real token is injected, `initialize` additionally records only HTTP
status, whether a session header was present, and the negotiated protocol
version; `tools_list` records only HTTP status, parser status, count, and tool
names. It never records an MCP result object or response body.

## Version and build evidence

Captured on 2026-08-30:

- Host architecture: `arm64`.
- Docker: `29.1.3`, build `f52814d`.
- Base: `docker.io/library/debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171`.
- Base index was inspected as a multi-platform OCI image; Home Assistant
  `aarch64` maps to `linux/arm64`, and `amd64` maps to `linux/amd64`.
- Direct package pins in the Dockerfile and both runtime images:
  `bubblewrap=0.8.0-2+deb12u1`,
  `ca-certificates=20250419~deb12u1`,
  `python3=3.11.2-1+b1`, and
  `util-linux=2.38.1-5+deb12u3`.
- Runtime versions in both images: Python `3.11.2`, bubblewrap `0.8.0`,
  setpriv/util-linux `2.38.1`, Debian glibc `2.36-9+deb12u14`.
- Version `0.1.4` capless-root ARM64 image ID:
  `sha256:cf4f776f7456abd60705331c8e1e70db15f2cb4a6198b1a095a8d6862c4aee83`.
- Version `0.1.4` capless-root amd64 image ID:
  `sha256:b9cd0347bcd7377ecd6bf23d6a5dfd1d73808d36938799cafe86a8d5ef69d2cd`.
- Version `0.1.3` ARM64 image ID after the GID-only follow-up:
  `sha256:7587e0f0566314a9426582c20c20dc9ae3c91a983d71523676f21b79da5da3d4`
  (after the safe-result schema, capability assertion, and NoNewPrivs audit
  fixes; final-source rebuild).
- Version `0.1.3` amd64 image ID after the GID-only follow-up:
  `sha256:5602223144ba0fa5ea3bc04a70163b9f6fe149f0562e24835fe428cacdc1db7a`
  (after the safe-result schema, capability assertion, and NoNewPrivs audit
  fixes; final-source rebuild).
- The earlier version `0.1.2` ARM64 image ID after the option-handoff and
  diagnostic fix was
  `sha256:1b266cba79765ea6e0d58cd647a40e96987c4380cea76755bf0c676f0e8a8627`.
- Earlier `0.1.0` local image IDs: ARM64
  `sha256:b76e55873923e3ccdb2b518384e48718d132c701c822b7ba1a3830a9ea199381`;
  amd64
  `sha256:3835d9255e03127291de14e9f17eebcc0882ebdea0ecad136a0e74973e0f350a`.

The glibc choice follows Spike 005: current Cursor Agent native modules need a
glibc loader and are not a safe fit for the current Alpine/musl HA base. This
harness proves only the future-compatible runtime shape; it does not download
or redistribute Cursor.

## Local validation

The following commands passed:

```text
ruby -e 'require "yaml"; YAML.load_file("spikes/008-protected-ha-app/config.yaml")'
sh -n spikes/008-protected-ha-app/entrypoint.sh spikes/008-protected-ha-app/build.sh spikes/008-protected-ha-app/smoke.sh
python3 -m py_compile spikes/008-protected-ha-app/backend_server.py spikes/008-protected-ha-app/provider_probe.py
./spikes/008-protected-ha-app/build.sh aarch64
./spikes/008-protected-ha-app/build.sh amd64
./spikes/008-protected-ha-app/smoke.sh no-marker aarch64
./spikes/008-protected-ha-app/smoke.sh write-marker aarch64
./spikes/008-protected-ha-app/smoke.sh no-marker amd64
./spikes/008-protected-ha-app/smoke.sh write-marker amd64
```

Version `0.1.4` ARM64 and amd64 passed both no-marker and provider-marker smoke
runs with provider UID/GID 0/0, no supplementary groups, empty capability and
bounding sets, `NoNewPrivs=1`, and backend UID/GID 1000/1000. The provider
wrote the root-owned mode-0644 synthetic fixture directly and passed create,
rename, delete, and symlink-replacement checks. The backend secret and process
environment remained denied, both provider environment secret checks remained
false, marker ownership was 0/0/0644 when requested, and the synthetic test
tree was removed after each run. Local Docker continued to deny bubblewrap
namespace startup, with later checks blocked by that prerequisite.

Historically, version `0.1.3` ARM64 and amd64 passed both no-marker and
provider-marker smoke
runs with a root-owned, mode-0600 `/data/options.json` fixture and a named
Docker volume containing a root-owned, mode-0775 `/config`. This named-volume
choice is important: Docker Desktop bind mounts do not reliably preserve Linux
DAC semantics, so a bind-mounted local directory cannot prove the GID-only
contract. Backend and provider UIDs were 1000 and 1001; backend GID was 1000;
provider primary GID was 1001 with supplementary GID 0; provider capabilities
and bounding set were empty; local Docker reported `NoNewPrivs=0` and
`Seccomp=2` while the protected host reported `NoNewPrivs=1` and `Seccomp=0`;
`distinct_uids`,
private-fixture denial,
process-environment denial, and both environment absence checks were true; the
no-marker run reported `provider.marker=not_requested`, the opt-in run
reported `provider.marker=created` with marker metadata UID/GID/mode
`1001/1001/0644`, and all direct listener checks reported `403`. Provider
`/config` target observations showed group write for
`.storage` and no write for `configuration.yaml` mode 0644, while the
backend could not write either target. The local namespace probe failed with
`user_namespace_denied`; the later two bubblewrap checks were reported as
`blocked_by_namespace_startup`.

The 0.1.3 namespace-startup bubblewrap check reported `fail` with exit code 1
and `user_namespace_denied` on Docker Desktop; the later two checks reported
`blocked_by_namespace_startup`. The image is protected from this test's point
of view (no extra privilege or host network was granted), but this does not
prove the HA OS kernel's bubblewrap behavior. The exact host-level error is
intentionally not surfaced through the app result; it could contain
runtime-specific details and is not needed for the safe schema.

The temporary Docker containers, named Docker volume, and temporary data bind
mount were removed by the smoke trap. Python `__pycache__` output was removed
after syntax validation.

## Manual HA validation checklist

These actions require the parent operator's disposable HA OS/Supervised host,
browser, and (only for the MCP test) an already configured Home Assistant MCP
integration. They were not performed here.

1. Take a normal HA backup or use a disposable host. Install the official SSH
   or Samba app if needed, and copy this directory as a subdirectory of
   `/addons`, for example `/addons/hass_conx_protected_ha_probe`. Do not copy
   any provider home, credential directory, or real secret into the app.
2. In the Supervisor App Store's Local Apps repository, refresh and select the
   app. Confirm that it is built locally because `config.yaml` has no `image`
   key. Keep Protection mode enabled and keep AppArmor enabled. Confirm the
   Supervisor UI shows no host port, host network, Docker API, `hassio_api`,
   `full_access`, devices, or privileged capabilities.
3. Confirm the installed app reports version `0.1.4`. Before the first start,
   confirm the option is `write_marker: false`. Start the app manually. Open it
   only from its administrator-only Ingress
   panel; do not expose port 8099. Capture `/result.json` through Ingress,
   retaining only the safe JSON fields listed above.
4. Verify the real result reports backend UID/GID 1000/1000, provider UID/GID
   0/0, and no provider supplementary groups. Verify both roles'
   `/config` readability/writability and `config_metadata`, plus the fixed
   `configuration.yaml` and `.storage` target observations. Verify provider
   capability metadata is empty and provider UID 0 has
   private-fixture denial, process-env denial, environment absence, and the
   five passing synthetic filesystem statuses. Confirm symlink replacement
   reports a regular entry afterward and an unchanged target, and confirm the
   dedicated synthetic directory no longer exists. Record the three bubblewrap
   statuses and bounded failure reasons. If
   `namespace_startup` fails, the later checks should report
   `blocked_by_namespace_startup`; do not interpret them as independent
   failures. Bubblewrap failure is negative hardening evidence, not an MVP
   failure for this candidate.
5. Verify direct access to the internal listener is not available from a
   browser/client path and that a request arriving from Supervisor Ingress is
   accepted. Verify nested UI/API paths use the `X-Ingress-Path` base path and
   do not generate a localhost callback or an app-relative provider login URL.
   Confirm the authenticated admin identity is the only browser identity that
   can reach the panel. Do not paste raw logs or headers into notes.
6. If the Core MCP integration is configured, run the app once with the
   default option and record only `supervisor_token_present`, initialize
   status/http status, tools-list status/count/names, and parser status. Do not
   print, copy, or inspect the token or response body. If the integration is
   absent, record `not_configured`/the expected HTTP error as an inconclusive
   capability result rather than changing HA services.
7. Only after the false-marker run and a backup, explicitly set
   `write_marker: true` in the app options and restart. Confirm provider UID
   0, not backend UID 1000, creates the only persistent test file:
   `/config/.hass-conx-spike-008-marker`, with the expected fixed marker
   content. Confirm that no device, service, automation, or other persistent HA
   configuration write occurred. Set it back to false afterward. The temporary
   synthetic tree is expected during each run and must be absent afterward.
8. Check Supervisor/AppArmor audit information for denials and verify that no
   provider-shaped process can read the synthetic backend fixture, backend
   environment, or `SUPERVISOR_TOKEN`. Record status classes only.
9. Stop and uninstall the app. Remove only the named marker from the disposable
   `/config` and the app's generated `/data/spike-008` state; restore the
   backup if this was not a disposable host. Remove the local `/addons` copy.

The safest sequence is: disposable host/backup, protection inspection,
`write_marker:false`, Ingress-only result capture, MCP read-only probe,
AppArmor/bubblewrap checks, then the one explicit marker opt-in, followed by
option reset and uninstall cleanup.

## Threats and design limits

- A writable full Home Assistant configuration mount is intentionally broad.
  Version 0.1.4 deliberately gives provider UID 0 ordinary owner access to the
  root-owned mount. Production adoption requires explicit user disclosure and
  approval semantics because a provider can read, replace, or delete Home
  Assistant configuration even without Linux capabilities.
- Version `0.1.3` adds supplementary GID 0 only to test the observed
  root:root mode-0775 mount contract while preserving provider UID/GID
  1001/1001 for created-file ownership. This is not a production identity
  recommendation: group 0 may grant additional access to files inside the
  image and mount, and the final design needs a narrower, explicitly reviewed
  group/adapter boundary.
- Capability-free UID 0 is still root-owned from a DAC perspective: it can
  access root-owned files according to their owner bits. Provider images must
  not contain root-owned secrets, and the protected-host rerun must confirm
  that backend-owned UID-1000 secret and process boundaries remain effective.
- `homeassistant_api: true` causes Supervisor to inject a powerful Core API
  bearer token into the app. The backend must keep it backend-owned and
  memory-only; it must never be passed to Codex, Cursor, an ACP subprocess, a
  browser, a provider config, a log, or a result file.
- The root entrypoint is a test orchestrator. It demonstrates distinct UIDs but
  is not a proof that a compromised UID-1000 backend cannot influence a
  provider process. Production should use separate provider subprocess
  sandboxes/containers and a narrow, reviewed broker boundary.
- The app accepts only the documented Supervisor Ingress peer address. This is
  necessary but not sufficient: real HA validation must confirm the peer,
  authenticated admin headers, path rewriting, WebSocket behavior, and no
  alternate host-port route.
- The local Docker runtime does not grant the kernel features bubblewrap needs.
  The local `fail` results cannot be promoted to an HA OS pass or failure
  without the protected-host run.
- Tool names are retained because the manual test needs to establish that
  `tools/list` completed; raw MCP bodies, session IDs, and authorization
  material are not retained.
- `apt` direct package versions are pinned in the Dockerfile, but Debian's
  repository metadata and transitive packages are not vendored. If this spike
  becomes a release base, move to a dated Debian snapshot or a signed internal
  mirror and publish image attestations.

## Findings template, result classification, and rerun

Use [`findings-template.md`](../../spikes/008-protected-ha-app/findings-template.md)
for the manual record. Keep all notes free of credentials, tokens, raw
response bodies, login URLs, and unredacted logs.

Accepted now:

- app metadata and requested least-privilege flags are structurally present;
- explicit pinned glibc multi-architecture Docker build;
- UID, provider `/config` DAC/write, `/proc`, environment-redaction, marker,
  direct-listener, and body-discarding MCP code paths pass their local checks;
- the 0.1.4 capless-root candidate passes direct overwrite, create, rename,
  delete, and symlink replacement on both local target architectures while
  retaining backend secret/process-environment isolation;
- the protected-host 0.1.4 run confirms the same filesystem authority, zero
  capability vectors, and backend secret/process-environment/token isolation;
- the protected-host 0.1.3 run confirms provider directory write through
  supplementary GID 0 while preserving provider UID/GID 1001/1001;
- the protected-host 0.1.3 false run is clean and the opt-in run creates only
  the named marker as UID/GID 1001/1001 mode 0644;
- protected-host capability metadata is all-zero with `NoNewPrivs=1` and
  `Seccomp=0`/no filters, and fixed user-namespace sysctl observations are
  recorded; and
- no provider package, credential, or service/device write is present.

Rejected design choices:

- Alpine/musl as the future Cursor-compatible base;
- public host ports, host networking, Docker socket, Supervisor API,
  `full_access`, privileged mode, or protection disabled;
- copying provider credentials into the app or logging raw MCP/login material;
- enabling the marker by default or using the marker as a substitute for a
  real HA write test.

Accepted from the first protected-host run:

- Supervisor accepts, builds, and starts the local protected app; end-to-end
  Ingress delivery remains a separate manual check;
- actual `SUPERVISOR_TOKEN` Core proxy and official MCP initialize/tools/list;
- UID separation plus backend-secret, process-environment, and token isolation.

Optional hardening still unavailable in the tested environments:

- bubblewrap namespace startup. Once namespace startup fails, later checks are
  reported as `blocked_by_namespace_startup` and are not independent failures.

Still inconclusive until further manual HA validation:

- a clean protected-host 0.1.4 false/true marker sequence after removing the
  retained UID-1001 marker, if complete marker provenance is desired;
- protected-host cleanup of the dedicated synthetic filesystem tree;
- AppArmor profile behavior with a future Cursor glibc runtime;
- actual Ingress peer/user identity, base-path rewrites, WebSocket behavior,
  and direct-route rejection;
- architecture behavior on physical HA `amd64` and `aarch64` hosts.

Rerun locally from the repository root:

```text
./spikes/008-protected-ha-app/build.sh aarch64
./spikes/008-protected-ha-app/smoke.sh no-marker aarch64
./spikes/008-protected-ha-app/smoke.sh write-marker aarch64
./spikes/008-protected-ha-app/build.sh amd64
./spikes/008-protected-ha-app/smoke.sh no-marker amd64
./spikes/008-protected-ha-app/smoke.sh write-marker amd64
```

The smoke script uses a temporary named `/config` volume and temporary `/data`
bind mount, publishes no host port, and removes its container, volume, and
temporary directory on exit. Run the HA checklist separately on a disposable
host; never substitute a real configuration directory in the local script.
