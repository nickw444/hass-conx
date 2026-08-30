# Task 004 — Create React/Vite application shell

**Status:** ⬜ Not started  
**Phase:** Foundation  
**Depends on:** 001, 003

## Objective

Create the minimal browser shell and prove browser-to-backend HTTP connectivity.

## Expected files

`apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, tests.

## Implementation

1. Add React, Vite and TypeScript.
2. Full-height shell titled `Hass-Conx`.
3. Fetch `/api/bootstrap`; show loading, error, and success states.
4. Show a small `DEV` marker when mode is local.
5. Do not introduce a large UI framework yet.

```tsx
export function App() {
  const bootstrap = useBootstrap();
  return <main><header>Hass-Conx</header>{bootstrap.mode === "local" && <span>DEV</span>}</main>;
}
```

## Validation

- [ ] `npm run build -w apps/web` succeeds.
- [ ] Component tests cover loading/success/backend unavailable.
- [ ] Browser displays backend mode.

Before committing, mark this file and tracker task 004 `✅ Done`. Preferred commit: `task 004: create react vite application shell`.