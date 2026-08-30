# HA-MCP Integration Design

## 1. Decision

Use `homeassistant-ai/ha-mcp` as the external Home Assistant capability layer.

Our project should **consume** HA-MCP rather than copy or reimplement its Home Assistant API surface.

Repository: <https://github.com/homeassistant-ai/ha-mcp>

## 2. Why HA-MCP is a good boundary

HA-MCP already owns a large and fast-changing Home Assistant tool surface, including approximately 88 tools at the time of this design.

Relevant capabilities include:

- entity search and current state;
- entity/device/area registry operations;
- automation/script/scene configuration;
- automation execution traces;
- history/statistics/logbook;
- Home Assistant logs and system health;
- dashboards;
- helpers;
- integrations;
- HACS;
- backups;
- service calls;
- configurable tool exposure and safety controls.

This eliminates a substantial amount of brittle Home Assistant-specific API code from our project.

## 3. Deployment recommendation

For the target Home Assistant OS / Supervised audience, run HA-MCP separately as a Home Assistant app.

Logical topology:

```text
HA Core
  ▲
  │ Supervisor/API
  │
HA-MCP app  <------ HTTP MCP ------  HA Agent app
                                      │
                                      └------ ACP agent
```

This provides:

- failure isolation;
- independent release cadence;
- easier debugging;
- clear ownership;
- no need to vendor HA-MCP into our image.

HA-MCP's own current documentation recommends its in-process custom component as the easiest general deployment. Our product can support either endpoint because the consumer contract is HTTP MCP. For our documented reference deployment, a separate app remains attractive for isolation.

## 4. Configuration

MVP app setting:

```yaml
ha_mcp_url: http://<internal-host>:9583/private_<secret>
```

The URL is sensitive because HA-MCP can use its secret path as the credential.

The value must:

- be stored in app-private `/data`;
- be redacted in logs;
- never be sent to the browser;
- never be exposed in frontend diagnostics.

The backend injects it directly into ACP session configuration.

## 5. Health checking

At startup and periodically:

- verify TCP/HTTP connectivity;
- perform MCP initialize/capability check where practical;
- record server availability;
- optionally record HA-MCP server version;
- display a degraded state when unavailable.

Do not block the entire app if HA-MCP is unavailable. Filesystem-only agent use can still work.

## 6. Tool policy

### Recommended defaults

Enable stable read/diagnostic tools needed for the product.

Keep these HA-MCP features **off by default**:

- beta filesystem tools;
- raw YAML editing;
- code-mode/custom-tool escape hatch.

Reason: native coding agents already have filesystem access in `/homeassistant`; enabling a second file mutation path creates ambiguity and additional risk.

### Mutating Home Assistant tools

There are two reasonable product profiles.

#### Safe/default profile

Allow:

- registry reads;
- states/history/traces/logs;
- configuration reads;
- validation/system health.

Restrict or disable:

- service calls;
- deletions;
- registry mutations;
- restart operations;
- backup restore;
- other destructive actions.

#### Full/admin profile

Expose stable HA-MCP tools broadly and rely on ACP/provider approval semantics plus clear UI warnings.

MVP should begin conservative and add an explicit setting for expanded capability.

## 7. Why not use HA-MCP filesystem tools

HA-MCP's filesystem and raw YAML tools are intentionally guarded and currently beta. They are useful for general remote MCP clients that lack direct workspace access.

Our agent already has direct access to `/homeassistant`, making these redundant.

Preferred ownership:

| Operation | Owner |
|---|---|
| read/edit `/config` files | coding agent |
| source search | coding agent |
| code/YAML refactor | coding agent |
| inspect live state | HA-MCP |
| inspect registries | HA-MCP |
| inspect traces/history/logs | HA-MCP |
| call HA services | HA-MCP |
| config validation/reload | HA-MCP when available |

## 8. Tool rendering

The frontend should recognize important HA-MCP tool families by tool name and render specialized cards.

Examples:

### Entity/state

```text
Living Room Lamp
light.living_room_lamp
State: on
Brightness: 64%
Area: Living Room
```

### Trace

```text
Hallway Lights — latest run

Motion trigger                 ✓
Sun below horizon              ✓
Illuminance below 15 lx        ✕ 21.4 lx

Stopped at condition 3
```

### History

MVP can render a concise summary/list rather than a full chart.

### Generic fallback

Unknown tool calls should show:

- friendly tool name if available;
- status;
- summarized arguments;
- summarized result;
- expandable raw JSON.

## 9. Avoid tight coupling to tool names

HA-MCP will evolve.

Implement renderers using a registry:

```ts
interface ToolRenderer {
  matches(server: string, tool: string): boolean;
  summarize(call: McpCall): ToolSummary;
  renderModel(call: McpCall): StructuredCardModel;
}
```

Unknown or renamed tools still work through the generic renderer.

## 10. Tool search

HA-MCP can expose its full catalog or a reduced search/proxy surface.

Do not hard-code one mode initially.

Preferred behavior:

- allow normal direct tool exposure where the agent runtime handles deferred/tool search well;
- support HA-MCP tool-search mode if a provider cannot efficiently handle the full catalog;
- expose this as an advanced compatibility option rather than a normal user-facing choice.

## 11. Security interaction with ACP approvals

Avoid requiring two separate interactive approval systems for the same action.

Recommended MVP:

- use HA-MCP tool enable/disable policy as the coarse capability boundary;
- use agent/ACP permission handling as the interactive user-approval experience;
- do not enable additional HA-MCP approval gates unless required for defence-in-depth.

## 12. Failure cases

### HA-MCP unavailable

UI:

> Home Assistant live tools unavailable. File access is still available.

Agent system context should also be informed so it does not repeatedly attempt unavailable calls.

### Tool removed/renamed

Render the returned MCP error and continue the session.

### Authentication/secret invalid

Mark integration disconnected and prompt the administrator to update HA-MCP connection settings.

### Tool call timeout

Show an individual tool failure without terminating the whole conversation unless the ACP provider itself aborts.

## 13. Compatibility research spike

Before committing to the architecture, verify the exact path:

```text
codex-acp -> Codex App Server -> HTTP MCP -> HA-MCP
```

Acceptance:

- HA-MCP initializes;
- tool catalog is visible;
- entity search succeeds;
- automation trace call succeeds;
- streamed `mcp_tool_call`/ACP events reach our client.

This is the first technical spike because historical Codex versions had Streamable HTTP MCP interoperability bugs.
