# Open Questions & Risks

## 1. Codex + Streamable HTTP MCP interoperability

### Risk

Historical Codex releases had bugs where some Streamable HTTP MCP servers initialized without exposing tools.

### Required spike

Test current:

```text
codex-acp -> Codex App Server -> HA-MCP HTTP
```

### Fallback

Use a local HTTP-to-stdio MCP bridge inside our app/runtime without changing the product architecture.

Priority: **P0 before implementation**.

---

## 2. HA-MCP deployment recommendation

### Question

Should docs recommend:

- separate HA-MCP app;
- HA-MCP in-process HACS custom component;
- either equally?

### Current inclination

Support either endpoint technically, but document the separate-app topology for isolation when using HAOS/Supervised.

### Trade-off

HA-MCP itself currently recommends its in-process component as the easiest deployment and it has convenient built-in webhook/local endpoint handling.

Priority: P1 before public release.

---

## 3. Automatic HA-MCP discovery

### Question

Can our app discover another installed HA app's internal hostname/endpoint reliably without asking the user to paste the secret URL?

### MVP

Manual endpoint configuration.

### Future

Investigate Supervisor app metadata/network aliases and whether HA-MCP can expose a supported discovery mechanism.

Priority: P2.

---

## 4. Admin-only Ingress enforcement

### Question

What is the cleanest supported way for a Home Assistant app frontend/backend to assert the current Ingress user is an administrator?

### Risk

Ingress authentication alone may establish that the user is signed in without providing sufficient identity/role details to the app.

### Requirement

Do not release mutation-capable functionality to ordinary HA users unintentionally.

Priority: **P0 security spike**.

---

## 5. Filesystem mount and read-only mode

### Question

Can runtime switching between read-only and read/write be enforced at the Home Assistant app mount level without reinstall/restart?

### Likely answer

Probably not dynamically; read-only may need to be an install/config option or enforced inside the container with separate workspace handling.

### Risk

A UI-only "read-only" instruction is not a sufficient security boundary.

Priority: P1.

---

## 6. Secrets in `/config`

### Risk

The coding agent may read `secrets.yaml`, `.storage`, or integration credentials and send them to a cloud model provider.

### Options

1. document clearly and permit full config access;
2. mount filtered/overlay workspace;
3. implement filesystem deny rules beneath the agent;
4. use provider sandbox features where possible.

### Recommendation

MVP: clearly document exposure, avoid extra HAOS mounts, and research whether `.storage`/specific secrets can be excluded without breaking normal agent behavior.

Priority: P0 product/security decision.

---

## 7. Permission semantics vary by provider

### Risk

Codex and Cursor may differ in:

- what operations generate approvals;
- whether a diff exists before write;
- allow-once vs allow-session semantics;
- shell sandbox behavior.

### Mitigation

UI should render normalized approval intent but retain provider-specific details and never imply a stronger guarantee than the provider gives.

Priority: P1.

---

## 8. Session history consistency

### Risk

ACP providers may expose different persistence/resume guarantees.

### Decision needed

How much transcript/activity does our app store independently?

### Recommendation

Provider is authoritative for model context; app stores enough normalized history for UI reconstruction and diagnostics.

Priority: P1.

---

## 9. Applied vs proposed file changes

### Risk

Some agent runtimes may apply a file patch and only then emit a file-change event. Others may request permission first.

### UX requirement

The UI must explicitly distinguish:

- Proposed / awaiting approval
- Applying
- Applied
- Failed

Never render an already-applied change as awaiting approval.

Priority: P0 UX correctness.

---

## 10. Tool call permissions

### Question

Does Codex's permission model request approval for every external MCP mutation, or can MCP calls happen without a user-visible permission boundary depending on configuration?

### Required spike

Test:

- HA-MCP read call;
- service call;
- registry mutation;
- destructive operation.

### Mitigation

Use HA-MCP's own tool enable/disable policy as a hard boundary regardless of provider approval behavior.

Priority: **P0 security spike**.

---

## 11. Generic UI dependency

### Question

Should we use `acp-components`, `assistant-ui`, or only lower-level React primitives?

### Recommendation

Prototype quickly with reusable OSS components, but do not make application architecture depend on a generic workbench shell.

Potential approach:

- own page/layout/domain components;
- reuse Markdown composer/thread primitives;
- reuse ACP client/state ideas where useful;
- keep normalized frontend event contract under our control.

Priority: P1.

---

## 12. Network requirements for Codex

### Risk

The agent runtime needs outbound connectivity for provider authentication/inference. Restrictive Home Assistant environments or DNS/proxy setups may break it.

### Requirement

Diagnostics should test provider network connectivity separately from HA-MCP connectivity.

Priority: P1.

---

## 13. Container architecture support

### Question

Which CPU architectures do all required runtime packages support?

Need to verify:

- amd64;
- aarch64;
- bundled `@openai/codex` binaries;
- `codex-acp` packaging.

Home Assistant users commonly run ARM64 hardware.

Priority: **P0 release feasibility**.

---

## 14. Resource usage

### Risk

Long-lived Codex/Cursor processes plus Node frontend/backend may consume significant memory on small HA appliances.

### Spike

Measure:

- idle app memory;
- idle provider runtime;
- active turn peak memory/CPU;
- multiple resumed sessions.

### Potential optimization

Stop provider processes after inactivity while retaining durable session IDs.

Priority: P1.

---

## 15. HA restart while session is active

### Risk

Home Assistant Core may restart independently while our app/agent stays alive.

Expected behavior:

- filesystem remains mounted;
- HA-MCP may temporarily disconnect;
- tool calls fail/retry gracefully;
- conversation survives.

Priority: P1 integration test.

---

## 16. HA-MCP schema evolution

### Risk

Tool names/output shape may evolve.

### Mitigation

- generic tool rendering fallback;
- specialized renderers are opportunistic;
- never make core conversation functionality depend on parsing a specific tool response;
- compatibility tests against selected HA-MCP versions.

Priority: ongoing.
