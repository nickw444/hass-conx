# Spike 004 — Home Assistant MCP injection and credential broker

Date: 2026-08-30

Status: brokered design and tested authenticated provider path accepted; the
official protected-app path is proven for initialize/tools-list. A minimal
live release smoke and optional `ha-mcp` validation remain manual.

This spike answers whether the backend can expose Home Assistant MCP through one normalized, provider-facing contract while keeping the upstream credential backend-owned. It is deliberately a local protocol harness: it does not contact a Home Assistant instance, read a real credential, or initiate an account login.

## Scope and source material

The spike was designed from [the technical design](../technical-design.md), [the PRD](../prd.md), and the completed [Spike 001 ACP parity report](001-acp-provider-parity.md). It preserves the two logical MCP names required by the design:

```text
homeassistant-assist
homeassistant-advanced
```

The current primary sources consulted on 2026-08-30 were:

- [Home Assistant MCP Server integration](https://www.home-assistant.io/integrations/mcp_server): the endpoint is `/api/mcp`, the built-in Assist API is `/api/mcp/assist`, the integration uses stateless Streamable HTTP, and a bearer token is required. Tools and prompts are supported; resources are Assist-only; sampling and notifications are not supported.
- [Home Assistant app communication](https://developers.home-assistant.io/docs/apps/communication/): an app with `homeassistant_api: true` uses `http://supervisor/core/api/` and the runtime-only `SUPERVISOR_TOKEN` as its bearer token.
- [Home Assistant app configuration](https://developers.home-assistant.io/docs/apps/configuration/): `homeassistant_api` grants the Core API proxy; `hassio_api` is a separate privilege for the Supervisor API.
- [Home Assistant MCP server implementation](https://github.com/home-assistant/core/blob/dev/homeassistant/components/mcp_server/http.py): the current Core routes are `/api/mcp` and `/api/mcp/{api_id}`; the implementation runs the MCP request statelessly.
- [Home Assistant MCP server source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/mcp_server/server.py): the integration maps the configured LLM API's tools and prompts into MCP.
- [ha-mcp](https://github.com/homeassistant-ai/ha-mcp) and its [in-process server guide](https://github.com/homeassistant-ai/ha-mcp/blob/master/docs/in-process-server.md): an optional third-party route. The guide documents a secret webhook/direct URL (or `ha_auth` mode), an in-memory HA admin token, and a one-install-only rule.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/): the current split packages provide Streamable HTTP client/server transports; stateless mode is supported.

## Reproducible implementation

All implementation is under [`spikes/004-ha-mcp-integration`](../../spikes/004-ha-mcp-integration):

- [`src/broker.ts`](../../spikes/004-ha-mcp-integration/src/broker.ts) starts an authenticated upstream MCP mock and two local broker endpoints. The upstream requires the in-memory synthetic bearer token. The broker's official MCP client transport injects that token; its local server exposes only an opaque local capability to callers.
- [`src/run.ts`](../../spikes/004-ha-mcp-integration/src/run.ts) runs the end-to-end fixture: unauthorized checks, `initialize`, `tools/list`, read, reversible write, health failure, restart, and reconnect.
- [`src/provider-probe.ts`](../../spikes/004-ha-mcp-integration/src/provider-probe.ts) launches the installed Codex and Cursor ACP CLIs with isolated homes and no credential environment. It sends the same `session/new.mcpServers` shape to both and records the auth gate.
- [`manual-protected-ha-check.sh`](../../spikes/004-ha-mcp-integration/manual-protected-ha-check.sh) is a read-only protected-environment check. It never prints or persists `SUPERVISOR_TOKEN` and only lists tools.
- [`fixtures/mcp-run.json`](../../spikes/004-ha-mcp-integration/fixtures/mcp-run.json) is a generated redacted local run.
- [`fixtures/codex-run.json`](../../spikes/004-ha-mcp-integration/fixtures/codex-run.json) and [`fixtures/cursor-run.json`](../../spikes/004-ha-mcp-integration/fixtures/cursor-run.json) are generated real-provider ACP runs, stopped at their authentication gates.
- [`fixtures/providers-run.json`](../../spikes/004-ha-mcp-integration/fixtures/providers-run.json) aggregates the provider results and contains only redacted metadata and test summaries; raw provider wire output is not retained.

The package is pinned in [`package.json`](../../spikes/004-ha-mcp-integration/package.json) and [`package-lock.json`](../../spikes/004-ha-mcp-integration/package-lock.json). `node_modules/` is ignored locally and is not part of the spike artifact.

## Versions and environment

Captured with:

```text
Node v26.0.0
npm 11.12.1
darwin / arm64
@modelcontextprotocol/client 2.0.0
@modelcontextprotocol/node 2.0.0
@modelcontextprotocol/server 2.0.0
@agentclientprotocol/sdk 1.4.0
@agentclientprotocol/codex-acp 1.7.0
zod 4.2.0
tsx 4.23.12
typescript 7.0.2
@types/node 26.1.0
codex-cli 0.150.1 (/opt/homebrew/bin/codex)
Cursor agent 2026.07.23-e383d2b (/Users/nickw/.local/bin/agent)
Cursor cursor-agent 2026.07.23-e383d2b (/Users/nickw/.local/bin/cursor-agent)
```

The official MCP SDK v2 requires Node 20 or newer. The broker uses `McpServer`, `NodeStreamableHTTPServerTransport`, `Client`, and `StreamableHTTPClientTransport`; no hand-written MCP framing is used.

## Commands

Run from the spike directory:

```sh
npm ci
npm run typecheck
npm test
npm run fixture -- --out fixtures/mcp-run.json
npm run probe -- --providers
```

The provider command writes `fixtures/codex-run.json`, `fixtures/cursor-run.json`, and `fixtures/providers-run.json`. It launches neither `authenticate` nor a browser. Provider processes use temporary `HOME`/`CODEX_HOME` directories and known credential variables are removed from their environment.

## Broker model

The data boundary is:

```text
ACP provider
  │ session/new.mcpServers: local URL + opaque local capability
  ▼
backend-owned broker
  │ official MCP Client + AuthProvider.token()
  │ injects upstream bearer token at request time
  ▼
Home Assistant MCP endpoint (mocked here; real HA is manual)
```

The provider-facing shape is the ACP v1 HTTP variant (headers are an array, as required by ACP):

```json
[
  {
    "type": "http",
    "name": "homeassistant-assist",
    "url": "http://127.0.0.1:<broker-port>/homeassistant-assist",
    "headers": [{ "name": "Authorization", "value": "Bearer [REDACTED]" }]
  },
  {
    "type": "http",
    "name": "homeassistant-advanced",
    "url": "http://127.0.0.1:<broker-port>/homeassistant-advanced",
    "headers": [{ "name": "Authorization", "value": "Bearer [REDACTED]" }]
  }
]
```

The actual local capability and synthetic upstream token exist only in process memory during the fixture. The redactor replaces both values and strips URL query material before persistence. The upstream token never appears in the provider config, and the upstream URL is never given to an ACP provider.

## Fixture evidence

The generated fixture passed these assertions:

```text
upstream without bearer                         401
broker without local capability                 401
provider config has stable names                true
provider config contains only local capability  true
broker-injected upstream bearer                 true
tools/list                                      ha_read_test_state, ha_set_test_state
read                                             {"enabled":false}
reversible write                                false -> true -> false
second logical endpoint                         read returned {"enabled":false}
healthy upstream                                status=ok
stopped upstream                                status=degraded (TypeError from failed fetch)
restarted upstream                               status=ok
post-reconnect read                             {"enabled":false}
redacted artifact contains either secret        false
```

Representative persisted trace entries are intentionally metadata-only:

```json
{
  "component": "broker",
  "event": "upstream_client",
  "upstreamAuthInjected": true,
  "forwarded": true
}
{
  "component": "upstream",
  "event": "accepted",
  "method": "POST",
  "path": "/mcp",
  "status": 200,
  "authorization": "present",
  "authValid": true,
  "forwarded": true
}
{
  "component": "broker",
  "event": "unauthorized",
  "method": "GET",
  "path": "/homeassistant-assist",
  "status": 401,
  "authorization": "absent",
  "authValid": false
}
{
  "component": "broker",
  "event": "upstream_error",
  "errorClass": "TypeError",
  "upstreamAuthInjected": true
}
```

The write tool is deliberately a boolean in-memory fixture, not a real entity. Its `false -> true -> false` sequence proves a reversible write path without changing a home.

## Historical pre-authenticated provider exercise

Both installed CLIs were exercised with the broker's two HTTP MCP entries in `session/new`:

| Capability | Codex ACP | Cursor ACP |
| --- | --- | --- |
| `initialize` | passed; ACP protocol 1 | passed; ACP protocol 1 |
| auth status surface | `api-key`, `chat-gpt-device-code` | `cursor_login` |
| HTTP MCP capability | `true` | `true` |
| SSE capability | `false` | `true` |
| `session/new` without login | blocked: `Authentication required` | blocked: `Authentication required` |
| MCP acceptance after session creation | inconclusive because auth gate precedes it | inconclusive because auth gate precedes it |
| login attempted | no | no |

The provider test summary records that the client constructed and attempted the
same standard `mcpServers` shape, including both stable names, before each
provider returned its authentication error. Authentication may precede MCP
validation, so this does not prove that either provider accepted the
configuration or connected to Home Assistant. An authenticated run remained
required at the time of this historical probe and is recorded in the current
qualification update above.

## Home Assistant and transport findings

The technical design's `http://supervisor/core/api/mcp/assist` path is supported by the current official documentation when all of the following are true:

1. The app declares `homeassistant_api: true`.
2. The app reads `SUPERVISOR_TOKEN` at runtime and sends it as `Authorization: Bearer ...`.
3. The MCP Server integration is configured in Home Assistant.
4. The intended API ID is `assist` (the built-in Assist API).

The official external Core paths are `/api/mcp` and `/api/mcp/assist`; therefore the Supervisor Core proxy maps them to `/core/api/mcp` and `/core/api/mcp/assist`. The current HA integration explicitly implements stateless Streamable HTTP. The design is accepted on this basis. Spike 008 subsequently proved the protected-app `/api/mcp/assist` initialize/tools-list path through the Core proxy; a minimal live Ingress/MCP release smoke remains appropriate.

For a non-Assist API ID, the official page says the caller must be an administrator. The backend should preserve the distinction between `401` (credential/auth), `404` (integration or API ID absent), and an upstream transport failure. It should not retry a 404 as a credential problem.

The optional third-party `ha-mcp` server is also HTTP-capable, but its secret webhook/direct URL is itself a credential. If used, that URL belongs behind the broker and must never be passed to ACP clients. The `ha-mcp` guide requires exactly one installation; mixing the custom component and add-on is a known source of hangs. Current in-process documentation requires Home Assistant 2026.6.0 or newer, so this is an additional manual compatibility gate, not a result of this local fixture.

## Proposed normalized internal contract

The application should normalize provider MCP setup and events before they reach UI/session state:

```ts
type NormalizedMcpServer = {
  name: "homeassistant-assist" | "homeassistant-advanced";
  transport: "streamable-http";
  providerUrl: string;       // broker URL only; never an upstream URL
  capabilityRef: string;     // opaque backend/session reference, not a token
};

type NormalizedMcpState =
  | { state: "disabled" }
  | { state: "connecting"; attempt: number }
  | { state: "ready"; tools: string[]; lastCheckedAt: string }
  | { state: "degraded"; reason: "unauthorized" | "not-found" | "upstream-error" | "timeout"; retryAt?: string }
  | { state: "reconnecting"; attempt: number; retryAt: string }
  | { state: "closed" };

type NormalizedMcpEvent =
  | { kind: "mcp.connection.state"; server: NormalizedMcpServer["name"]; value: NormalizedMcpState }
  | { kind: "mcp.tools.listed"; server: NormalizedMcpServer["name"]; count: number; names: string[] }
  | { kind: "mcp.tool.started"; server: NormalizedMcpServer["name"]; tool: string; requestId: string }
  | { kind: "mcp.tool.completed"; server: NormalizedMcpServer["name"]; tool: string; requestId: string }
  | { kind: "mcp.tool.failed"; server: NormalizedMcpServer["name"]; tool: string; requestId: string; reason: string }
  | { kind: "mcp.auth.required"; server: NormalizedMcpServer["name"]; interactive: boolean }
  | { kind: "mcp.reconnect.scheduled"; server: NormalizedMcpServer["name"]; attempt: number; retryAt: string };
```

Rules for this contract:

- `capabilityRef` identifies backend-managed state; it is not serializable as a bearer credential and is never logged.
- Tool arguments/results are retained only in the session's normal redacted event policy. Headers, access tokens, secret webhook URLs, and URL query strings are always redacted.
- The provider adapter receives only `NormalizedMcpServer[]`; Codex and Cursor-specific config is an adapter concern.
- `401` produces `mcp.auth.required` and an operator-visible manual-auth requirement. `404` produces `not-found`; it does not trigger token refresh. Connection errors produce `upstream-error` and bounded reconnect.
- The write permission policy remains separate from MCP transport health. A connected server is not permission to call a tool.

## Manual protected-HA validation and release smoke

Spike 008 has already proven the protected-app official Assist
`initialize`/`tools/list` path. Retain the checklist below as a minimal live
Ingress/MCP smoke and as the procedure for the optional user-supplied
`ha-mcp`; it is not a prerequisite for beginning implementation.

This is the exact validation still required from the project owner. It must use a disposable Home Assistant instance or a pre-approved test helper, never a production light/lock/cover.

1. In the app configuration, set `homeassistant_api: true`; do not add `hassio_api` unless a separate Supervisor API requirement is approved. Run the app in its normal Supervisor network, with `SUPERVISOR_TOKEN` available only in the process environment.
2. Install/configure the official Home Assistant **Model Context Protocol Server** integration in **Settings → Devices & services**. Select Assist and expose only the disposable test helper. Do not paste a token into the repository or a provider config.
3. From the protected app environment, run:

   ```sh
   SUPERVISOR_TOKEN='(set by the protected runtime, never echoed)' \
   HA_MCP_URL='http://supervisor/core/api/mcp/assist' \
   ./spikes/004-ha-mcp-integration/manual-protected-ha-check.sh
   ```

   The script prints only HTTP statuses, whether a session ID was present, and tool names. Repeat once with `HA_MCP_URL=http://supervisor/core/api/mcp` to verify the base endpoint. A `401` means auth/configuration; a `404` means the integration or API ID is not available. Do not print the response body if it contains URLs or credentials.
4. Confirm `tools/list` includes only the explicitly exposed helper. Check the schema before calling anything. For the disposable helper `input_boolean.hass_conx_spike`, the preferred safe sequence is the exposed equivalents of:

   ```json
   {"name":"HassGetState","arguments":{"entity_id":"input_boolean.hass_conx_spike"}}
   {"name":"HassTurnOn","arguments":{"entity_id":"input_boolean.hass_conx_spike"}}
   {"name":"HassGetState","arguments":{"entity_id":"input_boolean.hass_conx_spike"}}
   {"name":"HassTurnOff","arguments":{"entity_id":"input_boolean.hass_conx_spike"}}
   {"name":"HassGetState","arguments":{"entity_id":"input_boolean.hass_conx_spike"}}
   ```

   These are MCP `tools/call` argument payloads, not commands to run blindly: use the exact tool names and schema returned by `tools/list`; if the instance names them differently, stop and record the schema. The final observed state must be `off`. Remove the helper afterward if it was created only for this test.
5. Run an authenticated Codex ACP session and an authenticated Cursor ACP session using the broker's local `mcpServers` entries. Confirm that the providers see `homeassistant-assist` and `homeassistant-advanced`, while neither provider configuration nor logs contain `SUPERVISOR_TOKEN`, a long-lived token, or the direct HA/`ha-mcp` URL.
6. Stop/restart the MCP integration or the broker while observing the normalized state: `ready → degraded/reconnecting → ready`. Confirm a 401/404 is not retried as a network reconnect and that a temporary connection failure recovers after restart.
7. If using third-party `ha-mcp`, install exactly one mode, copy its connect URL directly into backend secret storage, verify its own auth mode, then repeat steps 3–6 through the broker. Never put the secret URL in ACP `mcpServers`.

## Original local decision (before later qualification)

Accepted: one TypeScript broker built on the official MCP SDK can drive both provider-facing ACP configurations while injecting an upstream credential at the backend boundary. The local executable proves `initialize`, `tools/list`, read, reversible write, redaction, health, failure, and reconnect semantics.

Rejected: passing `SUPERVISOR_TOKEN`, a long-lived HA token, a `ha-mcp` secret webhook URL, or the direct Home Assistant URL to either provider. The provider contract must contain the broker URL and an opaque local capability only.

Inconclusive/manual: authenticated Codex/Cursor MCP connection behavior and protected Home Assistant/Supervisor routing. Both installed providers stop at their explicit auth gate in the captured run, and no HA instance is available here.

Cursor MCP configuration remains inconclusive. Attempt the standard ACP
`session/new.mcpServers` shape first because both providers advertise HTTP MCP,
but retain runtime-only `.cursor/mcp.json` materialization as a
feature-detected compatibility path. Enable that fallback only if the protected
authenticated Cursor run rejects or ignores the standard shape; do not write
it into `/config` or claim either path works from this unauthenticated evidence.

## Current authenticated qualification update

The later 2026-08-30 qualification supersedes the original provider-auth gate
for the tested installations. Both Codex and Cursor accepted standard local
HTTP MCP injection through ACP and completed a harmless MCP tool call. Keep the
runtime-only Cursor `.cursor/mcp.json` path only as a compatibility fallback if
a future authenticated build rejects or ignores standard `mcpServers`; never
write it into `/config/.cursor` and never pass an upstream secret URL.

The optional `ha-mcp` server remains user-supplied and brokered. Its absence
must not block the official-MCP-only product path.
