# Executive Summary

## Problem

Home Assistant has excellent configuration and runtime introspection surfaces, but there is no simple, Home Assistant-native browser experience that combines all of the following:

- a high-quality coding agent such as OpenAI Codex or Cursor;
- direct read/write access to the Home Assistant configuration workspace;
- live access to entity states, registries, history, automation traces, logs, dashboards, and services;
- conversational interaction inside the Home Assistant UI;
- visible tool activity, diffs, and permission requests;
- interchangeable agent backends rather than lock-in to a single harness.

Existing solutions tend to own too much of the stack. They often bundle a custom agent harness, generic coding workbench, or provider layer that is difficult to adapt into a focused Home Assistant experience.

## Product thesis

Build a **thin Home Assistant-native product layer** over established agent runtimes and protocols rather than creating another agent harness.

The system should deliberately delegate responsibilities:

| Concern | Owner |
|---|---|
| Reasoning, coding, shell, filesystem edits | Codex / Cursor / other agent |
| Generic agent-client protocol | ACP |
| Live Home Assistant API/tool surface | HA-MCP |
| Browser UX, sessions, approvals, HA-specific rendering | Our app |
| Authentication into the web app, app lifecycle, networking | Home Assistant |

The app should feel like a first-party Home Assistant development and diagnostics tool, not a generic AI chat client embedded in Home Assistant.

## Proposed architecture

```mermaid
flowchart TB
    Browser[Home Assistant Browser UI] -->|Ingress / WebSocket| App[HA Agent App]

    App --> UIBackend[Session + UI Backend]
    UIBackend --> ACP[ACP Client]

    ACP --> Codex[Codex via codex-acp]
    ACP --> Cursor[Cursor via agent acp]
    ACP --> Other[Other ACP Agents]

    Codex --> Config[/homeassistant config workspace]
    Cursor --> Config
    Other --> Config

    Codex --> MCP[HA-MCP HTTP Server]
    Cursor --> MCP
    Other --> MCP

    MCP --> HA[Home Assistant Core]
    App -->|Ingress auth / Supervisor| HA
```

## Primary architectural decisions

### 1. ACP is the agent abstraction

Do not create a bespoke `AgentBackend` protocol unless required later. Use ACP as the primary internal contract between our app and agent implementations.

Initial agent implementations:

- **Codex:** `agentclientprotocol/codex-acp`, which runs OpenAI Codex App Server and exposes it through ACP.
- **Cursor:** Cursor's native `agent acp` command.
- **Custom:** any user-provided ACP-compatible executable in a later advanced mode.

This gives provider independence immediately.

### 2. HA-MCP is the Home Assistant capability layer

Run HA-MCP separately and inject its HTTP endpoint into every agent session.

HA-MCP should own access to:

- live entity states;
- entity/device/area registries;
- automation and script traces;
- history and statistics;
- system logs and health;
- automation/script/scene/dashboard configuration APIs;
- helpers, integrations, HACS, backups, and service calls.

Our project should not reimplement those APIs unless a specific UI need later justifies a narrow native endpoint.

### 3. Filesystem work remains native to the coding agent

The HA Agent app mounts Home Assistant's config directory read/write and sets it as the agent workspace.

The coding agent should directly handle:

- reading files;
- searching source;
- editing YAML / Python / JS / templates;
- generating diffs;
- invoking local validation commands when appropriate;
- maintaining repository context.

HA-MCP's beta filesystem and raw YAML editing features should be disabled by default to avoid two competing filesystem mutation paths.

### 4. The browser UX is purpose-built for Home Assistant

The user experience should prioritize:

- conversation;
- compact activity summaries;
- expandable technical details;
- Home Assistant entity cards;
- automation trace visualizations;
- file diffs;
- permission requests;
- clear read-only vs write-capable states.

Generic agent concepts should be hidden unless they help the user complete a Home Assistant task.

## MVP

The first useful release should support one provider well: **Codex via `codex-acp`**.

A successful MVP can:

1. sign in to Codex using the user's ChatGPT account;
2. start and resume a conversation;
3. read `/config` files;
4. write a file and show a diff;
5. call HA-MCP to list/search entities;
6. retrieve an automation trace;
7. render shell/file/MCP activity in the browser;
8. display and resolve permission requests;
9. run entirely through Home Assistant Ingress.

Cursor and arbitrary ACP backends can follow once the ACP client boundary is validated.

## Product positioning

This is not intended to be:

- a replacement for Home Assistant Assist;
- a generic LLM chat UI;
- another agent harness;
- an MCP server;
- a browser IDE.

It is a **Home Assistant development, configuration, debugging, and maintenance agent UI**.

## Key references

- HA-MCP: <https://github.com/homeassistant-ai/ha-mcp>
- Codex: <https://github.com/openai/codex>
- Codex ACP adapter: <https://github.com/agentclientprotocol/codex-acp>
- Agent Client Protocol: <https://agentclientprotocol.com/>
- Home Assistant apps: <https://developers.home-assistant.io/docs/apps/>
