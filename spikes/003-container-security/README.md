# Spike 003: container sandbox and secret isolation

This executable probe compares:

- an agent inheriting the backend environment;
- a scrubbed agent running as the backend Unix user;
- a scrubbed agent running as a distinct Unix user; and
- `bubblewrap` under default and relaxed Docker confinement.

It uses only the literal sentinel `synthetic-not-a-secret`.

Run:

```sh
./run.sh
```

The image and containers contain no application or account credentials. The
script creates a temporary host directory and removes it on exit.

This is a Linux-container preflight, not a substitute for running the same
probe as a protected Home Assistant app on both supported architectures.
