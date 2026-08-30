# Task 002 — Implement validated runtime configuration

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 001

## Objective

Create one typed configuration loader for both local and Home Assistant modes. Future backend code must consume this object instead of reading environment variables ad hoc.

## Expected files

`packages/shared/src/config.ts`, `apps/server/src/config.ts`, `.env.example`, tests.

## Implementation

1. Define `AppConfig`: `mode`, `host`, `port`, `workspacePath`, `dataPath`, optional `haMcpUrl`, `logLevel`.
2. Parse/validate environment once at startup; Zod is acceptable.
3. Local defaults: `127.0.0.1:3001`, workspace `./dev/homeassistant-fixture`, data `./.data`.
4. HA defaults: `0.0.0.0:8099`, workspace `/homeassistant`, data `/data`.
5. HA-MCP URL may be absent so filesystem/UI development still starts.

```ts
export interface AppConfig {
  mode: "local" | "home-assistant";
  host: string;
  port: number;
  workspacePath: string;
  dataPath: string;
  haMcpUrl?: string;
  logLevel: "debug" | "info" | "warn" | "error";
}
```

## Validation

- [ ] Tests cover local defaults, HA defaults, overrides, invalid mode and invalid port.
- [ ] No other module reads these `process.env` values directly.
- [ ] `.env.example` contains no real credentials or real HA endpoint.

Before committing, mark this file and tracker task 002 `✅ Done`. Preferred commit: `task 002: implement validated runtime configuration`.