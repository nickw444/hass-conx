# Web UI / UX Specification

## 1. Product UX objective

Create a web experience that feels like a native Home Assistant maintenance assistant, not an IDE or a generic AI workbench.

The interface should be usable by a power user on desktop while still making routine diagnosis comfortable on a tablet or phone.

## 2. Primary layout

```text
┌────────────────────────────────────────────────────┐
│ Home Assistant Agent                       ⚙       │
├───────────────┬────────────────────────────────────┤
│ Sessions      │                                    │
│               │  Conversation                      │
│ Today         │                                    │
│ • Hallway     │  user / agent messages             │
│ • Zigbee      │                                    │
│               │  tool activity                     │
│ Yesterday     │  diffs                             │
│ • Dashboard   │  approvals                         │
│               │                                    │
├───────────────┴────────────────────────────────────┤
│ Ask about your Home Assistant...         Send     │
└────────────────────────────────────────────────────┘
```

On narrow screens, session list becomes a drawer.

## 3. Default conversation rendering

### User message

Plain text bubble/card.

### Agent message

Markdown with:

- code blocks;
- tables;
- links;
- Home Assistant entity references optionally enhanced inline.

### Activity group

Do not insert dozens of verbose tool cards into the conversation by default.

Group activity compactly:

```text
✓ Read automations.yaml
✓ Read 3 automation traces
✓ Checked sensor history
▸ Ran config validation
```

Each item can expand.

## 4. Tool activity states

Supported visual states:

- queued;
- running;
- waiting for permission;
- completed;
- failed;
- cancelled.

Running activity should update live without causing major layout shifts.

## 5. File change card

```text
┌ Suggested change ───────────────────────────┐
│ automations.yaml                            │
│                                             │
│ - below: 10                                 │
│ + below: 20                                 │
│                                             │
│ 1 file changed                              │
│ [Open full diff]                            │
└─────────────────────────────────────────────┘
```

Important distinction:

- **proposed change** if approval occurs before mutation;
- **applied change** if the underlying provider writes first and reports afterward.

Do not imply a diff is pending approval if it has already been written.

## 6. Permission prompt

```text
┌ Permission required ─────────────────────────┐
│ Codex wants to modify:                      │
│ /homeassistant/automations.yaml             │
│                                              │
│ [View details]                               │
│                                              │
│       Reject             Allow once          │
└──────────────────────────────────────────────┘
```

Potential future option:

- Allow for session.

Avoid broad permanent allow unless provider semantics and security are well understood.

## 7. Home Assistant entity card

For recognized entity/state tool results:

```text
┌ Living Room Lamp ───────────────────────────┐
│ light.living_room_lamp                     │
│                                             │
│ On · 64%                                    │
│ Living Room · Hue ceiling light             │
│                                             │
│ [Open in Home Assistant]                    │
└─────────────────────────────────────────────┘
```

Where practical, deep link to the native Home Assistant more-info/entity page.

## 8. Automation trace card

This is a key product differentiator.

```text
┌ Hallway Lights · 21:42:17 ──────────────────┐
│ Trigger                                     │
│ ✓ Motion detected                          │
│                                             │
│ Conditions                                  │
│ ✓ Sun below horizon                        │
│ ✕ Illuminance below 15 lx      21.4 lx    │
│                                             │
│ Actions                                     │
│ — Not executed                              │
│                                             │
│ Stopped at condition 2                      │
│ [View complete trace]                       │
└─────────────────────────────────────────────┘
```

Full trace view can expose nested paths, variables, timestamps, and raw payload.

## 9. Shell command card

Compact default:

```text
✓ Ran command · 0.4s
  git diff -- automations.yaml
```

Expanded:

- command;
- cwd;
- exit code;
- stdout/stderr;
- duration.

Sensitive environment values must never be displayed.

## 10. Reasoning / plan

Show provider-supplied **reasoning summaries or plans** where permitted by the protocol, not hidden chain-of-thought.

Example:

```text
Plan
1. Inspect automation source
2. Check last failed trace
3. Compare relevant sensor history
4. Propose minimal fix
```

Keep collapsed by default if verbose.

## 11. Session list

Each session item shows:

- title;
- last updated relative time;
- provider icon/name;
- optional running indicator.

Actions:

- rename;
- archive;
- delete/remove when supported.

## 12. New session screen

Minimal default:

```text
What would you like to work on?

[ Ask about your Home Assistant... ]

Codex · Connected
Home Assistant tools · Connected
Config access · Read/write
```

Advanced controls hidden behind a settings affordance:

- provider;
- model;
- reasoning effort;
- read-only/full-access mode.

## 13. Settings

### Agent

- provider;
- connection/auth status;
- model;
- reasoning effort;
- provider version.

### Home Assistant

- config access mode: read-only / read-write;
- HA-MCP connection status;
- capability profile: diagnostic / full admin;
- test connection.

### Interface

- show reasoning summaries;
- auto-expand failed tools;
- compact/comfortable density.

### Diagnostics

- app/provider/HA-MCP versions;
- runtime logs;
- connection checks.

## 14. Empty/error states

### No agent connected

> Connect an agent provider to start using Home Assistant Agent.

### HA-MCP disconnected

> Live Home Assistant tools are unavailable. You can still inspect and edit configuration files.

### Config mounted read-only

> This session can inspect configuration but cannot modify files.

### Agent crashed

> The agent process stopped unexpectedly. Your session is preserved.

Buttons:

- Restart agent;
- Resume session;
- View diagnostics.

## 15. Accessibility

- keyboard navigation for prompt, session list, approvals;
- no status conveyed by colour alone;
- ARIA live region for streamed agent output without reading every token;
- code/diffs scroll horizontally without breaking layout;
- touch targets suitable for tablet use.

## 16. Technology direction

React-based frontend.

Two viable starting points from earlier research:

- `acp-components` as a fast prototype source for ACP-oriented interaction patterns;
- `assistant-ui` plus a thin ACP integration for a more controlled long-term component architecture.

Recommendation:

Use upstream components selectively, but keep our domain rendering and page structure in our own codebase from the start.
