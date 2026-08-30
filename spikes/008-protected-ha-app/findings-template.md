# Spike 008 manual findings

Copy this template into the operator's private test notes. Do not paste
`SUPERVISOR_TOKEN`, credentials, MCP response bodies, or Home Assistant logs
that contain them.

## Environment

- HA OS/Supervised version:
- Supervisor version:
- Host architecture (`amd64` or `aarch64`):
- App image/tag and image digest:
- App version shown by Supervisor (must be `0.1.4` for the capless-root experiment):
- Install date/time and disposable instance identifier:
- Protection mode shown by Supervisor: enabled / unexpected:
- AppArmor status/audit observations:

## Safe result capture

- Ingress `/result.json` captured: yes / no
- `backend.uid`:
- `backend.gid`:
- `provider.uid`:
- `provider.gid` (primary):
- `provider.supplementary_gids` (must be `[]` for 0.1.4):
- `provider.config_readable`:
- `provider.config_writable`:
- `provider.provider_home_writable`:
- `backend.config_metadata` (UID/GID/mode only):
- `provider.config_metadata` (UID/GID/mode only):
- Fixed target observations for `/config/configuration.yaml` and `/config/.storage` (metadata/access booleans only):
- `provider.distinct_uids`:
- `provider.backend_secret_readable`:
- `provider.backend_process_environment`:
- Bubblewrap `namespace_startup` status/reason:
- Bubblewrap `read_only_workspace` status/reason:
- Bubblewrap `workspace_write` status/reason:
- If namespace startup failed, later bubblewrap statuses were `blocked_by_namespace_startup`: yes / no:
- Provider capability fields (`Cap*`, `NoNewPrivs`, `Seccomp`) only (`Cap*` all
  zero and `NoNewPrivs` expected to be `1`):
- Synthetic filesystem statuses (`direct_overwrite`, `create`, `rename`,
  `delete`, and `atomic_replace_symlink` must pass):
- Synthetic symlink result (`entry_is_symlink_after: false` and
  `target_unchanged: true`):
- User-namespace sysctl presence/value only:
- `backend.official_mcp.supervisor_token_present` (boolean only):
- Official MCP initialize status/http status:
- Official MCP tools/list status/count/names (names only):
- Ingress request accepted from Supervisor source: yes / no:
- Direct container request rejected (403): yes / no / not tested:

## Opt-in marker

- `write_marker` was false before first run: yes / no:
- Provider UID 0 created the marker only after explicit opt-in: yes / no:
- `provider.marker`:
- `provider.marker_metadata` (UID/GID/mode only):
- Marker path observed: `/config/.hass-conx-spike-008-marker`
- Any device/service/configuration write occurred: no / unexpected:
- Marker removed during cleanup: yes / no:
- Atomic marker authoring result (named marker only; no production implication):

## Known protected-host 0.1.2 baseline

The operator's protected-host 0.1.2 evidence was:

- `/config`: UID 0, GID 0, mode 0775;
- backend UID/GID 1000/1000; provider UID/GID 1001/1001;
- both roles could read `/config`, but neither could write it;
- `write_marker: false`: both roles reported `marker_requested: false` and
  `not_requested`;
- `write_marker: true`: both roles reported `marker_requested: true`, backend
  reported `provider_opt_in_pending`, provider reported
  `write_failed_PermissionError`;
- official MCP initialize: HTTP 200, protocol 2025-06-18, no session header;
  tools/list count 32;
- provider secret/process-environment/Supervisor-token isolation passed; and
- all three bubblewrap probes failed with exit code 1 and
  `permission_denied`.

## 0.1.3 interpretation

Version 0.1.3 is a GID-only experiment. It keeps protection and AppArmor
enabled, declares no privileged/full-access setting, keeps backend UID/GID
1000/1000, and adds only supplementary GID 0 to provider UID/GID 1001/1001.
This tests the observed root:root mode-0775 group-write contract while
preserving provider-created file group ownership. It is not a production
identity decision and must not be generalized into unrestricted `/config`
access.

## 0.1.4 interpretation

Version 0.1.4 replaces only the provider identity experiment. The backend
remains UID/GID 1000/1000, while the provider-shaped probe is UID/GID 0/0 with
no supplementary groups, every capability and bounding set empty,
`securebits-noroot`, and `NoNewPrivs=1`. Protection, default AppArmor,
`full_access: false`, and `privileged: []` remain unchanged. The provider
touches only the opt-in marker and the dedicated synthetic directory
`/config/.hass-conx-spike-008-root-fs-test`, which the entrypoint removes after
the probe. This is a candidate identity test, not approval to weaken the outer
Home Assistant app boundary.

## Known protected-host 0.1.4 result

The operator's protected-host run confirmed provider UID/GID 0/0, no
supplementary groups, all-zero capability vectors, `NoNewPrivs=1`, writable
root-owned mode-0644 configuration, all five synthetic filesystem operations,
backend secret/process-environment isolation, provider token absence, and
successful official MCP initialization/tools listing. Bubblewrap failed with
`operation_not_permitted` and dependent checks were blocked. The retained
marker was reported `already_present` with UID/GID 1001/1001, so this run did
not establish fresh UID-0 marker provenance.

## Result

- Overall: accepted / rejected / inconclusive
- Evidence paths or screenshots (without secrets):
- Unexpected output or error class (no response bodies):
- Follow-up owner/action:
