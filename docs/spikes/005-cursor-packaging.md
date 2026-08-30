# Spike 005 — Cursor CLI packaging

Status: technically viable only with a glibc-based image; not release-ready. The
redistribution question is unresolved and must be answered before an image that
contains Cursor Agent is published.

Research and tests below were run on 2026-08-30. No credentials were read or
entered, no Cursor terms were accepted on behalf of a user, and no binary was
checked into this repository.

## Packaging conclusion

Cursor publishes a Linux `x64` and `arm64` Cursor Agent package, and the pinned
2026.08.25 package starts and answers ACP `initialize` in both architectures
when run in a glibc Debian container. At the time of this packaging spike this
proved only the core process and protocol path; the later authenticated
qualification is recorded below.

The package does not run on the common Home Assistant base examined here: the
current `ghcr.io/home-assistant/base:latest` is Alpine/musl, while Cursor's
bundled Node and native modules require glibc (`/lib/ld-linux-*.so.2`). Adding
Alpine `gcompat` was insufficient. A Cursor-enabled app therefore needs a
glibc-based image (or a separately justified glibc runtime), plus AppArmor and
process-supervision work.

Redistribution is the release blocker. Cursor's current Terms of Service grant
limited access/use and prohibit reproducing, modifying, creating derivative
works of, or renting/leasing/lending/selling the Service. The Cursor OSS notice
lists open-source components used in the IDE and does not grant a license for
the proprietary Agent CLI package. This is not a legal conclusion, but there is
no public permission found here that authorizes putting `agent-cli-package.tar.gz`
inside a Home Assistant app image. Written Anysphere permission or counsel's
documented interpretation is required.

Preferred technical direction, subject to that approval: build a glibc app image
per architecture, copy a pinned Cursor package into an immutable versioned path,
launch it by absolute path with `--disable-auto-update`, and ship upgrades as
Home Assistant app image releases. A fallback is a first-run/runtime fetch into
`/data/provider-state/cursor` using a pinned URL, independently recorded SHA-256,
and fail-closed verification. That fallback avoids us redistributing a binary,
but still needs legal review, requires network access, and has weaker availability
and supply-chain guarantees because Cursor publishes no checksum/signature for
this package.

The later 2026-08-30 authenticated qualification confirms that the native
Cursor ACP path for the tested `2026.08.25-3e8eec` installation passes
initialization, session creation, streaming, cancellation, load after provider
restart, standard local HTTP MCP injection, and a harmless MCP tool call. That
qualification does not change the packaging conclusion: Cursor distribution or
runtime-fetch legal approval remains a release gate, and final packaged
multi-architecture validation is still required. No publisher signature is
implied by the observed independent SHA-256 pin.

## Supportability matrix (original packaging evidence)

Rows about authentication and provider behavior below predate the later
authenticated qualification update above. They remain useful packaging and
source evidence, but do not override the newer tested-provider result.

| Area | Evidence | Decision | Conditions/blockers |
|---|---|---|---|
| ACP transport | Official docs specify `agent acp`, stdio, JSON-RPC 2.0, newline-delimited messages, `initialize`, `authenticate`, session lifecycle, updates, permissions, and cancel. | Accepted for technical integration | Must pin and contract-test the exact CLI build. |
| Linux amd64 package | Official installer maps Linux `x86_64`/`amd64` to `x64`; package URL returned HTTP 200 and an ELF x86-64 package. | Accepted for this observed build | Future availability and compatibility are not guaranteed. |
| Linux aarch64 package | Official installer maps Linux `arm64`/`aarch64` to `arm64`; package URL returned HTTP 200 and an ELF AArch64 package. | Accepted for this observed build | Must test on a representative HA aarch64 host; emulated/container smoke test is not sufficient. |
| glibc container runtime | Both packages ran `--version` and ACP initialize in Debian bookworm-slim glibc containers on the matching target architectures. | Accepted with glibc base | The app image must not be Alpine/musl unless Cursor changes its runtime or a separately qualified glibc layer is used. |
| Home Assistant base image | The common/current `ghcr.io/home-assistant/base:latest` examined here resolved to Alpine 3.24.1/musl on arm64; the Cursor Node binary failed with “required file not found”. `gcompat` plus `libstdc++`/`libgcc` still failed on `fcntl64`/glibc symbols. | Rejected on current HA base | Replace base and re-qualify s6, bashio, AppArmor, non-root operation, and app-store build behavior. |
| ACP authentication UX | Current ACP response advertises `cursor_login` and says to run `agent login` first. In a browserless container, `authenticate` returned a one-time login URL in the error data after failing to open a browser. | Inconclusive for no-terminal MVP | Implement URL extraction/display and manually complete a real account login in the HA Ingress UI on both architectures. Never log/store the challenge URL as ordinary diagnostics. |
| API-key authentication | Official ACP docs list `--api-key`/`CURSOR_API_KEY`; current CLI help also lists `--api-key`. | Technically accepted | Product must obtain/store the key as a write-only secret; paid-account E2E test remains outstanding. |
| Subscription authentication persistence | Official docs say browser login credentials are stored locally; no credential file was inspected in this spike. | Inconclusive | Manual restart/logout test required with a disposable provider home; do not read existing credentials. |
| ACP sessions/modes/permissions | Current ACP initialize advertised `loadSession`, session list, MCP HTTP/SSE, and prompt image capability. Docs list `agent`, `plan`, `ask` modes and `allow-once`, `allow-always`, `reject-once`. | Accepted baseline | Provider parity harness must test exact release and extension methods. |
| MCP injection | Official ACP docs require project/user `.cursor/mcp.json`; team dashboard MCP is not supported in ACP. | Accepted with adapter materialization | Generate runtime-only config under `/run/provider-config/cursor`; do not write `/config/.cursor` or secret URLs. |
| Version pinning | Installer embeds version `2026.08.25-3e8eec8` and a versioned URL; package stores a versioned runtime directory. | Technically accepted | Pin URL, expected length, independently computed SHA-256, target architecture, and CLI version in release metadata. No publisher digest/signature was found. |
| Artifact verification | HEAD responses provide `content-length`, multipart-looking ETag, Last-Modified, and S3 version ID, but no `Digest`, checksum file, or signature. | Inconclusive for strong supply-chain verification | Our SHA-256 observations are useful only as a pin; rebuilds must fail closed on mismatch and an upstream signed digest should be requested. |
| Automatic updates | Official install docs say CLI tries to auto-update by default; current package accepts hidden `--disable-auto-update`. `agent update` and `agent set-channel` are documented. | Accepted only with controlled launch | Always pass `--disable-auto-update`; treat hidden flag support as a version-gated contract test. Do not expose `agent update` from the app. |
| Rollback | Installer uses versioned directories and atomically replaces `agent`/`cursor-agent` symlinks, but no supported rollback command or retention policy is documented. | App-release rollback only | Keep provider runtime immutable; roll back the whole HA app image. Do not rely on provider self-update or mutable `/data` versions for recovery. |
| Redistribution in app image | Terms prohibit reproduction/lease/lend/sell of the Service; OSS page covers IDE dependencies, not Agent CLI. | Rejected pending written approval | Obtain an explicit Anysphere redistribution license/permission covering OCI images, both architectures, caching, fixed versions, notices, and app users. |
| Runtime fetch after user install | Technically feasible with the included verifier, and avoids storing the binary in this repository/image. | Inconclusive fallback | Legal must confirm the app may automate download/install for a user; network/offline and URL-retention risks remain. |
| Home Assistant app distribution | HA apps are OCI images; docs recommend pre-built per-architecture images and HA builder actions, support `amd64`/`aarch64`, and recommend image signing with Cosign. | Accepted platform model | No explicit HA prohibition on third-party proprietary binaries was found; app repository review and legal approval remain separate gates. |
| App security/Ingress | HA docs require Ingress and only allow Supervisor Ingress source `172.30.32.2`; protection is enabled by default; custom AppArmor is supported. | Accepted requirements | A glibc replacement image and Cursor subprocess need fresh AppArmor qualification; do not disable protection. |

## Official Cursor facts

### Installer and package resolution

The official installer at `https://cursor.com/install` was fetched without
executing it. It is a mutable shell script. On the retrieval date its relevant
logic was:

```text
Linux x86_64/amd64 -> x64
Linux arm64/aarch64 -> arm64
https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/${ARCH}/agent-cli-package.tar.gz
```

The fetched script embedded version `2026.08.25-3e8eec8`, creates
`$HOME/.local/share/cursor-agent/versions/<version>`, and symlinks both
`$HOME/.local/bin/agent` and `$HOME/.local/bin/cursor-agent`. It uses `curl | tar`
and performs no checksum or signature verification. The script itself was 5,668
bytes/203 lines with observed SHA-256
`f145a23a600d42c79bdf6a4cd36b77decb7b68359f4f0b86f60be3c84deea96c`.

The package contains a bundled Node runtime, `cursor-agent`, `cursorsandbox`,
`crepectl`, `rg`, native `pty.node`, SQLite/file-service/merkle native modules,
and JavaScript dependencies. The launcher uses the package-local `node` and
honours the provider home/config environment. The package's launcher is not a
system package and does not provide a Debian/APK package manifest.

Official pages used:

* [Cursor CLI installation](https://cursor.com/docs/cli/installation) — install command, `agent --version`, and default auto-update behavior (retrieved 2026-08-30).
* [Cursor CLI ACP](https://cursor.com/docs/cli/acp) — transport, request flow, auth method, modes, permissions, MCP limitation, and extension methods (retrieved 2026-08-30).
* [Cursor CLI authentication](https://cursor.com/docs/cli/reference/authentication) — browser login, API key, local credential storage, status, and logout (retrieved 2026-08-30).
* [Cursor CLI configuration](https://cursor.com/docs/cli/reference/configuration) — `CURSOR_CONFIG_DIR`, `CURSOR_DATA_DIR`, and update-channel configuration (retrieved 2026-08-30).
* [Cursor CLI headless mode](https://cursor.com/docs/cli/headless) — non-interactive operation and force/write behavior (retrieved 2026-08-30).

### ACP observations

The matching target packages were run in disposable Debian bookworm-slim
containers with a temporary HOME and no credentials. `agent --version` returned
`2026.08.25-3e8eec8` for both targets. The following request succeeded for both
architectures:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false},"clientInfo":{"name":"spike","version":"0.0.0"}}}
```

The response advertised `protocolVersion: 1`, `loadSession: true`, MCP `http`
and `sse`, prompt image support, session listing, and one auth method:
`cursor_login`. Its description says “Authenticate using existing Cursor login
credentials. Run `agent login` first if not logged in.”

With no credentials and no browser, `authenticate` with `methodId: cursor_login`
returned JSON-RPC `-32602` and an error message saying it failed to open the
browser and that the user should visit a `cursor.com/loginDeepControl` URL with
challenge/UUID parameters. The challenge URL was deliberately not retained in
this report. This is evidence that an app can likely present a login URL, not
evidence that login completion, callback handling, or credential persistence
works through Home Assistant Ingress.

ACP MCP behavior is an important adapter constraint: Cursor documents project or
user `.cursor/mcp.json`, and explicitly says team-level dashboard MCP servers are
not supported in ACP mode. The adapter must therefore materialize the official
and optional Home Assistant servers in a runtime-only provider configuration
tree, using secret minimization and redaction.

### Authentication and terms

The official authentication page documents browser login (`agent login`), status,
logout, and API-key authentication via `--api-key` or `CURSOR_API_KEY`. The ACP
page additionally lists `--auth-token`/`CURSOR_AUTH_TOKEN`. A provider account,
network access to Cursor services, and whatever Cursor plan/API entitlement is
required for the chosen account are prerequisites. This spike did not use an
account or inspect any local credential store.

The [Cursor Terms of Service](https://cursor.com/en-US/terms-of-service) page was
last updated August 13, 2026. Relevant facts (not legal advice):

* Anysphere grants a limited right to access and use the Service, subject to the
  Terms.
* Inputs may be used to provide the Service, enforce terms, and keep the Service
  safe; the user represents they have rights/permissions needed for processing.
* Section 1.5 prohibits, except where law makes a restriction impermissible,
  reverse engineering, reproducing, modifying, translating, creating derivative
  works of, or renting/leasing/lending/selling the Service; it also prohibits
  knowingly permitting a third party to do those things.
* The [Cursor OSS notice](https://cursor.com/licenses) is titled “Open Source
  Software License Notice”, was last updated March 23, 2025, and lists OSS
  dependencies used by the Cursor IDE. It contains no Agent CLI redistribution
  grant or Cursor Agent package license.

The exact approval needed is written permission from Anysphere (or a legal
opinion accepted by the project owner) that explicitly covers: copying the
proprietary Agent CLI into a public/private OCI image; serving it to HA users;
both Linux architectures; retaining/cacheing pinned versions; preserving
notices; and using the binary as a backend for the user's own Cursor account.
If runtime fetch is proposed instead, counsel must separately confirm that the
app may automate the user's download/install and cache the package. The app must
not click through, accept, or represent a user's agreement to Cursor Terms.

## Home Assistant platform facts

The [Home Assistant app overview](https://developers.home-assistant.io/docs/apps/)
states that apps are container images published to registries such as GHCR and
Docker Hub. The [publishing guide](https://developers.home-assistant.io/docs/apps/publishing/)
recommends pre-built images, requires the developer to build each architecture,
and recommends HA builder actions for multi-architecture images. A generic
multi-arch manifest is preferred over `{arch}` image names.

The [app configuration guide](https://developers.home-assistant.io/docs/apps/configuration/)
documents `amd64` and `aarch64`, `BUILD_ARCH`, and the `io.hass.arch` label. It
shows `ghcr.io/home-assistant/base:latest` (Alpine) as the common base and says a
pinned base is recommended for build stability. It does not require that every
app use that base, so a glibc base is technically possible, but a custom base
must reproduce required app behavior and security review.

The [app security guide](https://developers.home-assistant.io/docs/apps/security/)
requires careful rights selection and recommends protection, custom AppArmor,
least privilege, and signing published images with Cosign. The [Ingress guide](https://developers.home-assistant.io/docs/apps/presentation/)
requires `ingress: true`, allows streaming and WebSockets, and says only
`172.30.32.2` should reach the app server. The same presentation guide asks a
public app's DOCS to state the license under which the app is published. None of
these pages grants a license to redistribute a third-party proprietary binary;
no explicit HA app-store rule on that issue was found.

## Reproducibility and verification evidence

The exact observed artifacts are recorded in
[`cursor-agent-artifacts.json`](../../spikes/005-cursor-packaging/cursor-agent-artifacts.json).
The independently verified values were:

| Target | URL | Bytes | SHA-256 | HTTP observations |
|---|---|---:|---|---|
| amd64 | `https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/x64/agent-cli-package.tar.gz` | 84,518,977 | `7a212e5a17ff9316f5acc78808e33c536940d5455645022e6388d99ba48c8425` | `Last-Modified: Tue, 25 Aug 2026 22:26:13 GMT`; ETag `061fb2c7a821f0c177b4088f2974714b-11`; S3 version ID observed. |
| arm64 | `https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/arm64/agent-cli-package.tar.gz` | 83,111,698 | `f1c1c2330d89fa4ef5b6cc04fcffba15012ff50eacd07e0f3baec0716f25ac5d` | `Last-Modified: Tue, 25 Aug 2026 22:26:14 GMT`; ETag `7415fa2f8c6b4b8de7b1e59435e268f1-10`; S3 version ID observed. |

Both URLs returned HTTP 200, `content-type: application/x-tar`, and
`accept-ranges: bytes`. The ETags have multipart suffixes (`-11`, `-10`) and
are not treated as MD5 or a publisher signature. No `Digest` header, checksum
sidecar, detached signature, or public signing key for Agent CLI was found.

The pinned package contains dynamically linked ELF files. The arm64 Node
interpreter is `/lib/ld-linux-aarch64.so.1` and its dependencies include glibc
`libc.so.6`, `libstdc++.so.6`, `libgcc_s.so.1`, `libdl.so.2`, `libpthread.so.0`,
and `libm.so.6`; the x64 package has the corresponding x86-64 glibc loader and
libraries. This is why a glibc base is required.

The [fetch-agent.sh](../../spikes/005-cursor-packaging/fetch-agent.sh) helper
downloads only the pinned target URL, checks exact byte length and SHA-256,
rejects unsafe archive paths, extracts to a temporary directory, verifies the
CLI version, and refuses an existing destination. It never reads credentials,
accepts terms, or stores a binary in this repository. It launches with the
currently observed hidden `--disable-auto-update` option; future versions must
be tested before changing the pin.

## Packaging models

### Model A — immutable vendor package in a glibc app image (preferred after approval)

Build separate amd64 and arm64 images from a pinned glibc base. At build time,
fetch the exact URL, verify the recorded length/SHA-256, and copy the extracted
package into `/opt/cursor-agent/<version>/<arch>`. Run the provider using the
absolute package path and:

```text
/opt/cursor-agent/<version>/<arch>/cursor-agent --disable-auto-update acp
```

Do not expose a mutable provider `update` command. Release the app and provider
as one versioned image, sign the final OCI image with Cosign, preserve Cursor's
notices and the project's third-party notices, and roll back the whole image
when provider qualification fails. This gives the strongest reproducibility,
offline startup after image pull, and clear upgrade/rollback semantics. It is
blocked by redistribution permission and the glibc base migration.

### Model B — pinned runtime fetch into `/data` (fallback after approval)

Keep the provider archive out of the image and repository. On first provider
enablement, fetch the pinned architecture URL into a temporary file, verify exact
length/SHA-256, atomically install under
`/data/provider-state/cursor/versions/<version>`, and launch that fixed path.
Do not run Cursor's official `curl | bash` installer. Cache the verified package
for restart/offline use, fail closed if the URL or digest changes, and expose
the package version/digest in diagnostics without exposing credentials.

This avoids our direct binary redistribution, but it is not fully deterministic:
the upstream URL may disappear, Cursor supplies no signed digest, initial setup
needs internet, and legal treatment of an app-automated user download is
uncertain. It also requires a user-facing “download Cursor Agent” action and a
clear failure state, not a hidden startup mutation.

### Rejected models

* Official `curl https://cursor.com/install | bash` at image build/startup: the
  script and version selection are mutable, no checksum/signature is verified,
  default auto-update can drift, and the installer mutates a home directory.
* User-installed host binary: HA apps do not provide a supported arbitrary host
  executable mount, and it violates the product's no-terminal onboarding goal.
* Cursor desktop `.deb`/RPM/AppImage: these are desktop distributions, not the
  headless `agent acp` runtime; they add GUI/system-library requirements and do
  not solve redistribution or Alpine compatibility.
* A silent Alpine `gcompat` workaround: the observed package still failed on
  glibc symbols after adding `gcompat`, `libstdc++`, and `libgcc`.

## Required blockers and decisions

1. Obtain written Anysphere permission for Model A, or legal approval of Model B.
   This is the release-blocking decision.
2. Choose and qualify a glibc app base while preserving Home Assistant app
   protection, custom AppArmor, Ingress, `/config` mapping, Supervisor/Core API
   access, and non-root operation.
3. Run a real disposable Cursor account test through the HA Ingress UI on
   representative amd64 and aarch64 HA OS/Supervised hosts: login URL completion,
   restart persistence, logout, session resume, streaming, cancellation,
   permission response, direct `/config` edit, official MCP, and optional MCP.
4. Establish a vendor support/retention policy for pinned package URLs and request
   upstream signed checksums or signatures. Until then, independently pinned
   SHA-256 is integrity checking against accidental drift, not origin
   authentication.
5. Re-run the provider parity harness for every package update. Treat missing
   `--disable-auto-update`, changed `cursor_login`, changed MCP behavior, or
   changed native dependencies as a release failure.

## Rerun instructions

All commands are read-only with respect to this repository and must use a
disposable temporary provider home. They do not require or accept credentials.

Fetch current installer text without executing it:

```sh
curl -fsSL https://cursor.com/install | sed -n '1,220p'
curl -fsSL https://cursor.com/install | shasum -a 256
```

Inspect headers (do not infer a cryptographic digest from ETag):

```sh
curl -fsSL -D - -o /dev/null \
  https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/x64/agent-cli-package.tar.gz
curl -fsSL -D - -o /dev/null \
  https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/arm64/agent-cli-package.tar.gz
```

Run the verifier in a matching glibc container. The command downloads into the
container and removes it with the container; it does not write a binary here:

```sh
docker run --rm --platform linux/arm64 \
  -v "$PWD/spikes/005-cursor-packaging:/spike:ro" \
  debian:bookworm-slim bash -lc \
  'apt-get update -qq && apt-get install -y -qq ca-certificates curl >/dev/null && \
   /spike/fetch-agent.sh arm64 /tmp/cursor-agent-installed'

docker run --rm --platform linux/amd64 \
  -v "$PWD/spikes/005-cursor-packaging:/spike:ro" \
  debian:bookworm-slim bash -lc \
  'apt-get update -qq && apt-get install -y -qq ca-certificates curl >/dev/null && \
   /spike/fetch-agent.sh amd64 /tmp/cursor-agent-installed'
```

For ACP smoke testing, send only `initialize` with no credentials. Use
`--disable-auto-update`, a temporary HOME, `--read-only`, and `--tmpfs /tmp`;
retain only redacted protocol capabilities. Do not run `agent status`, `agent
login`, or provider commands against a real existing home during a rerun.

## Artifacts

* [`docs/spikes/005-cursor-packaging.md`](../../docs/spikes/005-cursor-packaging.md) — this report.
* [`spikes/005-cursor-packaging/cursor-agent-artifacts.json`](../../spikes/005-cursor-packaging/cursor-agent-artifacts.json) — observed version, URLs, lengths, independently computed digests, and HTTP metadata.
* [`spikes/005-cursor-packaging/fetch-agent.sh`](../../spikes/005-cursor-packaging/fetch-agent.sh) — pinned, fail-closed fetch/verify/extract helper; no binaries.
