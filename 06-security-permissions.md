# Security & Permissions Design

## 1. Security posture

This product intentionally gives a coding agent unusually powerful access:

- read/write access to Home Assistant configuration;
- shell/process capability inside the app sandbox;
- live Home Assistant administrative tools through HA-MCP.

It must therefore be treated as an **administrator development tool**, not a general household chat assistant.

## 2. Trust boundaries

```mermaid
flowchart LR
    Browser[Authenticated HA admin browser] --> App[HA Agent App]
    App --> Agent[ACP Agent Process]
    Agent --> FS[/homeassistant RW]
    Agent --> MCP[HA-MCP]
    MCP --> Core[Home Assistant Core]
    Agent --> Provider[OpenAI / Cursor cloud service]
```

Primary boundaries:

1. Browser ↔ app: Home Assistant Ingress authentication.
2. App ↔ agent: local ACP transport, typically stdio.
3. Agent ↔ config: mounted filesystem.
4. Agent ↔ HA-MCP: secret local HTTP endpoint.
5. Agent ↔ external model provider: provider-controlled authenticated connection.

## 3. User access

MVP should be **admin-only**.

Do not expose the app to ordinary HA users merely because they can access the Home Assistant frontend.

If Home Assistant app/Ingress metadata cannot enforce admin-only access directly, the backend should use available HA session/user context or another supported mechanism to verify administrator access before opening the application session.

This needs explicit implementation research.

## 4. Filesystem access

### Default

Read/write `/homeassistant` for the primary target audience.

### Optional safer mode

Expose app setting:

- Read only
- Read/write

The setting should alter the actual mount/access boundary where practical, not merely instruct the agent not to write.

### Sensitive files

Important examples include:

- `secrets.yaml`;
- `.storage/*`;
- SSL/private keys if mapped;
- custom integration credentials embedded in YAML.

MVP policy should explicitly decide whether the agent may read these.

Recommended initial stance:

- do not provide additional sibling HAOS volumes;
- only mount `homeassistant_config`;
- allow filesystem permissions of the config mount to be the main boundary;
- document that secrets contained inside `/config` are potentially readable by the coding agent/model.

A future secret-deny layer could block selected paths, but it may interfere with legitimate source analysis and would require robust enforcement below the agent process.

## 5. Provider data exposure

Anything the agent reads may potentially be transmitted to the selected model provider as context.

The UI must state this clearly during provider setup.

Do not imply that filesystem access remains local merely because execution runs locally.

## 6. HA-MCP secret handling

HA-MCP's secret endpoint URL is a credential.

Requirements:

- store only in backend app data;
- redact from logs;
- never include in browser payloads;
- never echo into agent-visible prompt text;
- pass via ACP/MCP configuration programmatically;
- provide Rotate/Update workflow.

If possible, prefer a local authentication mechanism that does not encode long-term credential material into the URL, but do not block MVP on this.

## 7. Capability profiles

### Diagnostic profile — recommended default

Allow:

- states;
- registries reads;
- traces;
- history/statistics/logbook;
- config reads;
- logs/system health;
- validation.

Deny/disable:

- device service calls;
- deletion;
- registry writes;
- restart/restore;
- dangerous admin operations.

### Admin profile

Allows broader stable HA-MCP mutation tools.

Switching to Admin should require an explicit administrator action with warning text.

## 8. Interactive permissions

Use ACP/provider permission requests as the primary in-chat approval UX.

At minimum:

- Reject
- Allow once

The UI must display the requested operation in user-meaningful terms.

### File writes

Prefer showing:

- path;
- intended operation;
- diff where the provider exposes one before approval.

If the provider only reports changes after applying them, the UI must not misrepresent the write as pending.

### Home Assistant control

For sensitive calls, show domain/service/target prominently.

Example:

```text
Call Home Assistant service
lock.unlock
Target: Front Door
```

## 9. Avoid double approvals

HA-MCP has its own tool-security mechanisms. Using both HA-MCP interactive approval gates and ACP interactive permissions can produce a confusing multi-stage approval chain.

MVP recommendation:

- HA-MCP tool enablement = coarse policy boundary;
- ACP/provider permission request = interactive approval boundary.

Use HA-MCP's independent security gates only as optional defence-in-depth.

## 10. Prompt injection / untrusted data

Runtime data, logs, entity names, dashboard text, notifications, fetched web pages, and files can contain adversarial instructions.

Mitigations:

- preserve agent harness sandbox/approval behavior;
- keep destructive HA-MCP tools disabled by default;
- never turn tool output into privileged backend commands outside the agent's normal tool path;
- do not create hidden backend automations that execute content returned by the model;
- clearly distinguish external/untrusted content in system/provider instructions where possible.

## 11. Shell/network access

The agent runtime may be able to execute shell commands.

Recommended Codex settings:

- workspace-limited sandbox by default;
- no broader host filesystem access;
- network access only where required by provider/tool operation;
- avoid mounting Docker socket, Supervisor control sockets, or host root.

The app container itself is a security boundary and should remain minimally privileged.

## 12. App privileges

Do not request Supervisor privileges beyond what is actually required.

Specifically avoid, unless proven necessary:

- host PID namespace;
- Docker socket;
- privileged mode;
- host networking;
- arbitrary HAOS volume mounts.

The desired architecture should work with:

- Ingress;
- config mount;
- ordinary local network connectivity.

## 13. Logging

Logs must redact:

- HA-MCP secret URLs;
- OAuth tokens;
- API keys;
- Authorization headers;
- provider refresh/access tokens.

Raw prompt/tool logs should be opt-in because they may contain household data or secrets.

## 14. Backups and recovery

The product should recommend users maintain normal Home Assistant backups.

Future enhancement:

- pre-change local git checkpoint;
- optional HA backup before broad/high-risk changes.

Do not automatically create expensive full backups before every small edit.

## 15. Security acceptance tests

- non-admin user cannot access app UI;
- HA-MCP URL never appears in browser network payloads except where absolutely unavoidable;
- log redaction tests cover all known credential formats;
- read-only mode blocks actual writes;
- disabled HA-MCP mutation tools are unavailable to agent;
- rejected ACP permission results in no action;
- app container cannot access host root or Docker socket;
- provider auth persists without exposing tokens to frontend JavaScript.
