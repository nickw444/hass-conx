# Home Assistant Conversational Agent — Product Requirements

**Status:** High-level product definition

**Audience:** Product, design, engineering, and technical reviewers

**Last updated:** 2026-08-30

## 1. Product summary

Home Assistant Conversational Agent is an administrator-only Home Assistant app that provides a focused conversational interface for configuring, diagnosing, and operating a Home Assistant instance.

The product composes existing systems rather than creating a new agent stack:

- [assistant-ui](https://www.assistant-ui.com/) supplies the conversational UI primitives.
- [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) is the contract between the app and coding-agent runtimes.
- Codex and Cursor supply the agent harnesses, model access, tool execution, and filesystem operations.
- Home Assistant's [official MCP server](https://www.home-assistant.io/integrations/mcp_server/) supplies the Assist-oriented Home Assistant capability surface.
- The optional, unofficial [ha-mcp](https://github.com/homeassistant-ai/ha-mcp) server supplies broader Home Assistant configuration and diagnostic capabilities.

The app runs agents with the Home Assistant configuration directory as their workspace. Once the administrator explicitly enables full access, agents may read and write the complete directory, including advanced internal paths such as `.storage`.

## 1.1 Qualification baseline

The current direction is supported by the accepted Spike 008 protected-app
result and the 2026-08-30 authenticated provider qualification. The backend is
UID 1000; provider processes are capability-free UID 0 with `NoNewPrivs=1`.
The protected/default-AppArmor app maps the complete `/config` directory,
including root-owned files, without `full_access`, privileged capabilities, or
host networking. Backend credentials and `SUPERVISOR_TOKEN` remain outside the
provider environment and model context. The official
`/api/mcp/assist` initialize/tools-list path is proven through the Core proxy.

Codex and Cursor both passed authenticated ACP initialization, session
creation, streaming, cancellation, load after provider restart, standard local
HTTP MCP injection, and a harmless MCP tool call in the tested installations.
Permission behavior remains provider-defined; a safe command in that run did
not emit a permission event. This baseline does not qualify the final packaged
multi-architecture image or a live Home Assistant release matrix.

Codex API-key authentication remains explicitly unverified. Cursor packaging
and redistribution approval remains a release gate. The optional `ha-mcp`
server remains user-supplied and nonblocking for an official-MCP-only product.

## 2. Problem

Home Assistant administrators currently have to move between the Home Assistant UI, YAML files, logs, traces, developer tools, terminal sessions, documentation, and general-purpose AI tools to understand or change their system.

General-purpose chat interfaces lack local configuration access and live Home Assistant context. Coding-agent terminals have the necessary power, but they are not designed around Home Assistant concepts and are awkward to use from the Home Assistant web interface.

The product should combine the power of a mature coding agent with a Home Assistant-native, conversational experience without owning model inference, inventing another agent harness, or duplicating Home Assistant's APIs.

## 3. Product principles

### Compose, do not replace

Use established open protocols, libraries, and runtimes. The app should own the product experience and integration logic, not model reasoning or generic agent execution.

### ACP is a real portability boundary

Codex and Cursor are equal MVP targets developed in parallel. A feature is not considered provider-agnostic merely because an interface exists; the same acceptance workflows must run through both providers using ACP.

### Agentic by design

This is not a read-only support bot. In write-enabled mode, the agent can edit configuration, execute commands, call read/write MCP tools, and control Home Assistant within the permissions exposed by the selected agent runtime and MCP server.

### Transparent power

The interface should make agent messages, commands, file changes, MCP calls, permission requests, and failures understandable without presenting the user with an IDE by default.

### Explicit trust boundary

Full Home Assistant configuration access is deliberately powerful and risky. The product must explain that configuration may contain secrets and internal state, and that prompts and retrieved content may be sent to the selected model provider.

### The user owns recovery

The app does not create automatic checkpoints, backups, commits, or rollback snapshots. Administrators are responsible for Home Assistant backups or version control in `/config`. The UI should show changes, but observability is not a recovery mechanism.

## 4. Target users

### Primary user

A technically confident Home Assistant administrator who:

- manages automations, scripts, dashboards, integrations, templates, or custom components;
- is comfortable granting a coding agent broad access to the Home Assistant configuration;
- wants the agent to combine source inspection with live runtime information;
- understands the need for backups or version control;
- values a simpler Home Assistant-oriented experience over a generic terminal agent.

### Explicitly excluded users

- non-administrator Home Assistant users;
- installations where untrusted users can submit prompts;
- users expecting guaranteed safe autonomous control;
- users who are not willing to send relevant Home Assistant data to their chosen provider.

## 5. Goals

### Primary goals

- Provide a polished conversational interface inside Home Assistant.
- Support Codex and Cursor as equal MVP agent providers through ACP.
- Allow Codex authentication with a ChatGPT subscription and optionally an OpenAI API key.
- Allow Cursor authentication through the authentication methods supported by Cursor CLI.
- Give the agent direct read/write access to the Home Assistant configuration directory after explicit opt-in.
- Connect agents to Home Assistant's official Assist MCP server.
- Optionally connect agents to a user-supplied `ha-mcp` URL.
- Stream agent reasoning summaries, messages, tool activity, commands, file changes, and permission requests.
- Persist and resume conversations across browser and app restarts where supported by the provider.
- Remain useful when only the official MCP server is configured.

### Secondary goals

- Render Home Assistant entities, automations, traces, and other known MCP results more clearly than raw JSON.
- Work well at desktop and tablet widths and remain usable for small mobile interactions.
- Allow provider, model, mode, and connection status to be inspected without exposing unnecessary implementation detail.
- Preserve raw ACP and tool details for troubleshooting.

## 6. Non-goals

The MVP will not:

- build or host an LLM;
- implement a proprietary agent harness;
- replace the Home Assistant frontend;
- become a browser IDE or general-purpose shell product;
- provide non-admin or multi-tenant access;
- isolate sessions or credentials per Home Assistant administrator;
- support Home Assistant Container or Core installations;
- automatically install or configure Home Assistant MCP integrations;
- create automatic backups, checkpoints, Git commits, or rollback snapshots;
- guarantee that every provider asks permission for identical operations;
- guarantee a complete audit, diff, or attribution record for provider-owned
  shell, filesystem, or MCP side effects;
- conceal the entire Home Assistant configuration from the selected model provider;
- guarantee support for arbitrary ACP agents in the MVP.

## 7. Supported environment

The MVP targets:

- Home Assistant OS and Home Assistant Supervised;
- Home Assistant's app system, formerly called add-ons;
- `amd64` and `aarch64` architectures;
- administrator-only access through Home Assistant Ingress;
- a single shared set of provider credentials, settings, and conversations per app installation.

The minimum supported Home Assistant version will be set during implementation based on the official MCP, Ingress, and app APIs used by the release.

## 8. Core user jobs

### Understand current state

> Which downstairs lights are on, and why is the hallway light unavailable?

The agent uses official Assist MCP context and, when available, deeper `ha-mcp` state and registry tools.

### Diagnose an automation

> Why did the garage light automation not run last night?

The agent inspects relevant configuration files and, when `ha-mcp` is connected, traces, history, entity metadata, and logs.

### Author or modify configuration

> Add an automation that turns on the porch lights at sunset and turns them off at midnight.

The agent edits the appropriate configuration or uses a suitable Home Assistant MCP configuration tool, validates where possible, and explains the change and any reload or restart requirement.

### Work with advanced internals

> Find the entity registry entry for this orphaned sensor and explain what still references it.

With full configuration access enabled, the agent may inspect `.storage` and other internals as well as MCP results. Direct mutation of internal files remains possible and is intentionally within the expert trust boundary.

### Operate Home Assistant

> Reload automations and test the new one.

The agent may call write-capable MCP tools, including actions with real-world effects, subject to the runtime's permission flow and the user's decisions.

## 9. MVP product requirements

### 9.1 Onboarding and trust

- The app must clearly state that it is an administrator tool with broad local and remote capabilities.
- `panel_admin` may control sidebar visibility, but the backend must
  independently verify the authenticated Ingress user is an active Home
  Assistant administrator before serving or mutating application data.
- Before the first agent session, the administrator must acknowledge that:
  - `/config` can contain credentials, tokens, databases, and internal state;
  - relevant content may be transmitted to Codex, Cursor, and configured MCP services;
  - the agent can modify configuration and control Home Assistant;
  - the app provides no automatic rollback;
  - the administrator is responsible for backups or version control.
- The app must report whether the official MCP server and optional `ha-mcp` server are connected.
- Missing integrations must produce setup guidance rather than a generic connection error.

### 9.2 Conversation and sessions

- Create a new conversation using either Codex or Cursor.
- Stream assistant output incrementally.
- Show when a turn is running, waiting for input, waiting for approval, complete, cancelled, or failed.
- Cancel an active turn.
- Resume supported sessions after navigating away or restarting the app.
- List, rename, archive, and delete conversations.
- Record which provider, model, and agent mode a session uses.
- Prevent concurrent prompts from corrupting a session; queueing or rejection must be explicit.

### 9.3 Provider selection and parity

- Codex and Cursor must both be visible provider choices in the MVP.
- Both integrations must use ACP for initialization, authentication, session lifecycle, prompts, streaming updates, cancellation, and permissions wherever the provider supports those ACP capabilities.
- Provider-specific behavior must remain behind a provider adapter and must not leak into the general frontend contract.
- Unsupported capabilities must be detected from ACP negotiation and reflected in the UI.
- The release must publish a capability matrix showing verified differences between Codex and Cursor.
- A provider counts as passing parity only after authenticated workflows run
  against the exact shipped binary on both `amd64` and `aarch64`; fixture and
  unauthenticated initialization results must remain separately labelled.

### 9.4 Authentication

#### Codex

- Support ChatGPT subscription authentication using the Codex device-code
  flow. Do not expose a localhost-callback browser flow through Ingress.
- Cache and refresh authentication using Codex's supported credential mechanism.
- Provide logout and authentication-status controls.
- Allow OpenAI API-key authentication.
- Clearly label the API-key path as unverified until it has been tested against a real account; lack of test credentials must not be represented as successful validation.
- Never display, log, or return stored credentials to the browser after submission.

#### Cursor

- Support the account login flow exposed by Cursor CLI/ACP without requiring the user to open an app terminal.
- Support authentication status and logout.
- Support API-key or auth-token paths only where the installed Cursor CLI officially advertises them.
- Cursor release support requires an approved redistribution or runtime-fetch
  legal model, a pinned glibc-compatible package, disabled auto-update, and
  deterministic per-architecture verification.

### 9.5 Home Assistant configuration access

- Mount the complete Home Assistant configuration directory read/write into the app.
- Use that directory as the agent's working directory.
- Full access must be gated by the one-time trust acknowledgement and visible session mode.
- The app must not silently filter `.storage`, databases, `secrets.yaml`, or other internal paths after full access is enabled.
- File changes reported by ACP should be rendered as diffs where data is available.
- The app must not imply that displayed diffs capture every possible filesystem mutation made through arbitrary shell commands.
- Activity must identify whether it was provider-reported, directly observed by
  an ACP client RPC, or detected post hoc. An absent event must never be
  presented as proof that no change occurred.
- The app must not automatically initialize Git, commit changes, create snapshots, or restore files.

### 9.6 Home Assistant MCP

#### Official Assist MCP

- Treat Home Assistant's official MCP server as the primary Home Assistant MCP connection.
- Use the built-in Assist API endpoint and Home Assistant's exposed-entity policy.
- Support its read and control tools, prompts, and available resources.
- Detect when the MCP Server integration is not installed or is unavailable.
- Explain that this connection is Assist-oriented and does not expose all Home Assistant administration capabilities.

#### Optional `ha-mcp`

- Allow the administrator to enter a `ha-mcp` Streamable HTTP URL.
- Treat the URL as a secret because it may contain an embedded access token or secret path.
- Keep the official Home Assistant token and optional secret URL in a
  backend-owned local broker. Provider configuration receives only a
  per-session local broker capability.
- Validate connectivity and show server/tool status.
- Do not install, update, or administer `ha-mcp` automatically in the MVP.
- Recommend the current in-process HACS custom component and exactly one `ha-mcp` deployment.
- Recommend leaving `ha-mcp` filesystem and YAML-writing tools disabled so direct agent filesystem access is the authoritative file-editing path.
- Permit the remaining read/write `ha-mcp` tools, including configuration and operational tools.

### 9.7 Activity and permissions

- Render ACP permission requests and all options supplied by the provider.
- At minimum, support allow once and reject; support broader options only when the provider offers them.
- Visually distinguish reads, file changes, commands, MCP calls, and actions with side effects.
- Keep raw arguments, results, stdout/stderr, and provider metadata behind expandable details.
- If the browser disconnects while approval is pending, the request must remain safely pending for a bounded period or be rejected; it must never be silently approved.
- Pending requests must have visible pending, resolved, cancelled, expired, and
  orphaned states and reject stale responses from an older provider process.
- The UI must not promise identical permission behavior across providers.
- The app must not add a blanket read-only proxy in front of MCP: read/write behavior is a core product capability.

### 9.8 Settings and status

- Configure and inspect Codex and Cursor authentication.
- Configure, test, and remove the optional `ha-mcp` URL.
- Show official MCP availability.
- Select supported provider modes and models from negotiated capabilities.
- Show app, ACP adapter, provider CLI, and protocol versions for diagnostics.
- Provide a redacted diagnostic export that excludes credentials and secret URLs.

## 10. UX requirements

### Home Assistant first

Use Home Assistant names and concepts in primary UI copy. Prefer “Read automation traces” over a raw MCP function name while preserving the technical name in details.

### Conversation first

The conversation, current activity, and required user decision should dominate the layout. Provider settings, raw protocol data, and long logs should be secondary.

### Progressive disclosure

Summarize routine reads and commands compactly. Expand automatically for failures, permission requests, and consequential changes.

### Honest state

Never report a write, validation, reload, or device action as successful until the relevant provider event or tool result confirms it.

### Clear provider identity

Always make the selected provider and mode discoverable. Provider differences should be explained when they affect the available action, not hidden behind a false common denominator.

## 11. Acceptance workflows

Each workflow must be executed against both Codex and Cursor unless explicitly marked provider-specific.

### A. Authentication and first conversation

1. Open the app through Home Assistant Ingress.
2. Complete the trust acknowledgement.
3. Sign in to the provider without using a terminal.
4. Start a session and receive a streamed response.
5. Close and reopen the UI and resume the session.

### B. Official MCP state and control

1. Ask the agent to list exposed lights and their current state.
2. Observe the official MCP activity in the UI.
3. Ask the agent to operate one exposed light.
4. Resolve any provider permission request.
5. Confirm the tool result is shown accurately.

### C. Configuration edit

1. Ask the agent to change an automation in `/config`.
2. Observe file and command activity.
3. Inspect the resulting diff or change report.
4. Confirm no automatic checkpoint, commit, or backup was created.

### D. Combined source and runtime diagnosis

1. Ask why a recent automation did not run.
2. Have the agent inspect local configuration.
3. With `ha-mcp` enabled, inspect relevant trace/history/runtime data.
4. Receive a conclusion grounded in both sources.

### E. Permission interruption

1. Trigger an action that requires approval.
2. Refresh or disconnect the browser while it is pending.
3. Reconnect and resolve it, or observe a safe timeout/rejection.
4. Confirm the action was never silently allowed.

### F. Provider parity

Run workflows B–D once with Codex and once with Cursor. Record differences in negotiated capabilities and UI behavior without changing the frontend's session model.

## 12. Success measures

### Technical-preview release gates

- Both providers complete authentication, session creation, streaming, and
  cancellation without terminal access. Exercise provider permission behavior
  where it is exposed; when a provider does not emit a prompt for the safe test
  operation, retain an explicit provider-defined/no-permission disclosure.
- Those provider checks use the exact pinned release builds on both target
  architectures and distinguish provider evidence from deterministic fixtures.
- Both providers complete the official MCP state workflow and a direct configuration edit.
- If the administrator configures optional `ha-mcp`, it completes at least one
  diagnostic read and one configuration write through each provider; its
  absence must not block the official-MCP-only release path.
- No credential or secret MCP URL appears in browser payloads, ordinary logs, or diagnostic exports.
- No permission request is silently dropped or approved.
- App restart does not corrupt stored session metadata.
- The app runs on representative `amd64` and `aarch64` Home Assistant systems.
- The protected app runs on a pinned glibc base without disabling protection,
  and provider processes cannot read backend Home Assistant/MCP credentials.
- Cursor redistribution or automated runtime download has written project-
  owner-approved legal clearance before Cursor is included in the release.

### Qualitative measure

A Home Assistant power user should prefer this app over opening a generic coding-agent terminal for routine Home Assistant authoring and diagnosis, while still understanding that the underlying agent has substantial power.

## 13. Dependencies and product risks

- ACP and its adapters are evolving; versions must be pinned and compatibility tested before upgrades.
- Cursor requires glibc in the observed builds, lacks a publisher-signed digest,
  and has no public redistribution grant found by the spike; packaging remains
  a release blocker until explicitly approved.
- Bubblewrap or another nested provider sandbox may be unavailable inside a
  protected Home Assistant app; this is optional future hardening, not an MVP
  or release gate.
- The official Assist MCP server exposes a narrower surface than users may expect.
- `ha-mcp` is unofficial and can change independently of this product.
- Full `/config` access can expose secrets, corrupt internal state, or break Home Assistant.
- MCP calls can cause physical effects or destructive configuration changes.
- Provider permission semantics are not identical and cannot be made identical without taking ownership of execution.
- Session histories and activity logs may themselves contain sensitive Home Assistant data.

## 14. Future considerations

- Additional ACP agents from the ACP registry.
- Per-administrator credentials and session isolation.
- Home Assistant Container/Core deployment outside the app system.
- Rich entity, device, automation, trace, dashboard, and camera renderers.
- Attachments, screenshots, and voice input.
- Optional policy profiles or read-only deployments.
- Optional user-managed Git workflows, without making Git a product requirement.
