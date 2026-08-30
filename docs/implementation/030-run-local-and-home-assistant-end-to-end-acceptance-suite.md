# Task 030 — Run local and Home Assistant end-to-end acceptance suite

**Status:** ⬜ Not started  
**Phase:** Release validation  
**Depends on:** 001-029

## Objective

Verify the complete MVP in local-native, local-Docker, and Home Assistant app modes. This task validates; it must not become a feature grab-bag.

## Expected artifact

`docs/validation/mvp-e2e.md` plus optional reusable smoke/Playwright scripts.

## Procedure

1. Local native: `npm run dev` with fixture workspace and real OAuth-enabled HA-MCP webhook.
2. Complete Codex auth, HA-MCP OAuth, state lookup, automation trace, fixture file edit/diff, cancel and permission flow.
3. Local Docker: repeat health/session/basic MCP smoke against production image.
4. HA app: install published image, open through Ingress, verify `/homeassistant` workspace and same public HA-MCP webhook path.
5. Record exact versions of HA, HA-MCP, Webhook Proxy, Codex, codex-acp and Hass-Conx.

```markdown
| Scenario | Local native | Local Docker | HA app |
|---|---:|---:|---:|
| Codex auth | ✅ | ✅ | ✅ |
| HA-MCP OAuth | ✅ | ✅ | ✅ |
| Entity state | ✅ | ✅ | ✅ |
| Automation trace | ✅ | ✅ | ✅ |
| File edit + diff | ✅ | ✅ | ✅ |
```

## Validation

- [ ] All required rows pass or are explicitly blocked with linked issue/evidence.
- [ ] No credentials appear in committed logs/screenshots.
- [ ] Do not mark this task Done until both local and HA app acceptance paths are complete.

Before committing, mark task 030 `✅ Done` in this file and tracker.