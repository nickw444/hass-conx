# Open Questions & Risks

## 1. Downstream MCP OAuth through `codex-acp` — P0

The Webhook Proxy `ha_auth` flow is the chosen authentication model. The remaining question is how completely `codex-acp` surfaces an OAuth request originating from an HTTP MCP server.

Required spike:

```text
Hass-Conx ACP client -> codex-acp -> HA-MCP webhook -> OAuth challenge
```

Acceptance: browser can complete HA login and Codex subsequently sees HA-MCP tools without Hass-Conx implementing its own OAuth server.

Fallback: smallest possible ACP/codex-acp extension or provider adapter that exposes Codex App Server's downstream MCP OAuth operation.

---

## 2. Codex + Streamable HTTP MCP interoperability — P0

Historical Codex versions had issues initializing some Streamable HTTP MCP servers.

Test current Codex/codex-acp with the real HA-MCP Webhook Proxy. If it still fails, use an HTTP-to-stdio transport bridge as a compatibility layer without changing the public architecture.

---

## 3. Admin-only Ingress enforcement — P0

Determine the cleanest supported way for the packaged app to enforce administrator-only access. Ingress authentication alone must not accidentally make mutation-capable functionality available to ordinary users.

---

## 4. Local workspace strategy — P0

Default is a checked-in fixture. Developers may point to a real mounted/replicated HA config path.

Question: should the project provide first-party helper scripts for Samba/SSHFS/network mounting, or deliberately leave mounting outside scope?

Initial answer: leave mounting external; support any local path.

---

## 5. Secrets in the workspace — P0

A coding agent may read `secrets.yaml` or `.storage` and send content to a cloud provider.

MVP must document this clearly. Future hardening could use filtered mounts/overlays or agent-level deny rules, but those can break legitimate debugging.

---

## 6. Webhook Proxy privilege semantics — P0

`ha_auth` validates a Home Assistant token but the HA-MCP app executes with its own privileges. OAuth is not a per-user authorization boundary.

Mitigation: conservative HA-MCP tool exposure plus ACP permissions; packaged app remains admin-only.

---

## 7. Permission semantics vary by provider — P1

Codex and Cursor may differ in approval timing, available choices, shell sandboxing and whether a diff exists before a write.

Frontend event model must represent provider truth rather than pretending all providers have identical guarantees.

---

## 8. Session persistence differences — P1

Providers may expose different resume/history guarantees.

Provider session is authoritative for model context; Hass-Conx stores enough normalized metadata/activity for UI reconstruction.

---

## 9. Applied vs proposed file changes — P0

Some runtimes may emit file-change events only after application.

UI states must distinguish proposed, awaiting approval, applying, applied and failed.

---

## 10. Tool-call approval coverage — P0

Verify whether Codex permission policy covers external MCP mutations in the way expected.

Test a read, service call, registry mutation and destructive/admin operation. HA-MCP tool enable/disable remains the hard coarse boundary regardless.

---

## 11. Generic UI dependency — P1

We may reuse assistant-ui/acp-components primitives, but application architecture and normalized event contracts must remain ours. Do not depend on a generic workbench shell.

---

## 12. Network topology / hairpin access — P1

In packaged HA mode the agent calls the public HA webhook URL from inside the HA environment. Some networks/reverse proxies may not support NAT hairpinning or resolving the external hostname internally.

Mitigations:

- allow endpoint override;
- document split DNS/reverse proxy requirements;
- retain advanced direct/private URL fallback for problematic installations.

Local mode still uses the public URL naturally.

---

## 13. CPU architecture support — P0 release feasibility

Verify amd64 and aarch64 support for Node image, `@openai/codex`, `codex-acp`, and any native dependencies.

---

## 14. Resource usage — P1

Measure idle memory, one active Codex process, multiple sessions and restart behavior on common HA hardware.

---

## 15. Local dev authentication — P1

Local mode is intentionally developer-only and loopback-bound. If remote/LAN access to local Hass-Conx becomes a supported feature later, add a real web authentication story rather than weakening the default.
