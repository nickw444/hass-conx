# Task 029 — Publish multi-architecture container image in CI

**Status:** ⬜ Not started  
**Phase:** HA packaging  
**Depends on:** 006, 028

## Objective

Publish reproducible amd64/arm64 images to GHCR so the Home Assistant app can install the same image tested locally.

## Expected files

`.github/workflows/container.yml`, any manifest image-name update.

## Implementation

1. Use GitHub Actions + buildx.
2. Publish at least `linux/amd64` and `linux/arm64` on release tags; optional dev tag for manual testing.
3. Use immutable version tags plus controlled stable/latest alias.
4. Minimal workflow permissions: contents read, packages write.
5. Keep image naming consistent with `addon/config.yaml`.

```yaml
permissions:
  contents: read
  packages: write
```

## Validation

- [ ] Workflow syntax validates.
- [ ] Test/release run publishes both architectures.
- [ ] `docker buildx imagetools inspect` shows amd64 and arm64.
- [ ] HA manifest resolves correct image naming.

Before committing, mark task 029 `✅ Done` in this file and tracker.