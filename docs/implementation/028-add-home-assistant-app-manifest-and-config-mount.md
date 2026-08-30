# Task 028 — Add Home Assistant app manifest and config mount

**Status:** ⬜ Not started  
**Phase:** HA packaging  
**Depends on:** 006, 027

## Objective

Add Home Assistant app packaging metadata while keeping application business logic independent of Supervisor.

## Expected files

`repository.yaml`, `addon/config.yaml`, optional translations/docs.

## Implementation

1. Enable Ingress and set app port.
2. Map `homeassistant_config` read/write to `/homeassistant`.
3. Use `/data` for app persistence.
4. Set HA-mode runtime defaults: mode, host, port, workspace, data path.
5. Do not request privileged mode, host network, Docker socket or unrelated HAOS volumes.
6. Prefer `image:` pointing to the GHCR image built by task 029; do not duplicate application source inside the add-on folder.

```yaml
name: Hass-Conx
slug: hass_conx
ingress: true
ingress_port: 8099
map:
  - type: homeassistant_config
    read_only: false
    path: /homeassistant
```

## Validation

- [ ] Current Home Assistant app schema/hassio lint passes.
- [ ] Manifest requests no unnecessary privileges.
- [ ] Exact container env/path assumptions are documented.

Before committing, mark task 028 `✅ Done` in this file and tracker.