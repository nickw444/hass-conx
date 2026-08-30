#!/usr/bin/env bash
set -euo pipefail

# Fetch one pinned Cursor Agent package for an OCI build or disposable test.
# This script deliberately does not use Cursor's mutable curl|bash installer.
# It never accepts credentials or terms for a user and does not ship binaries
# in this repository.

die() {
  printf 'fetch-agent.sh: %s\n' "$*" >&2
  exit 1
}

if [ "$#" -ne 2 ]; then
  die "usage: fetch-agent.sh <amd64|arm64> <destination-directory>"
fi

ARCH="$1"
DEST="$2"
VERSION="2026.08.25-3e8eec8"
BASE_URL="https://downloads.cursor.com/lab/${VERSION}/linux"

case "$ARCH" in
  amd64)
    CURSOR_ARCH="x64"
    EXPECTED_SHA256="7a212e5a17ff9316f5acc78808e33c536940d5455645022e6388d99ba48c8425"
    EXPECTED_BYTES="84518977"
    EXPECTED_MACHINE="x86-64"
    ;;
  arm64)
    CURSOR_ARCH="arm64"
    EXPECTED_SHA256="f1c1c2330d89fa4ef5b6cc04fcffba15012ff50eacd07e0f3baec0716f25ac5d"
    EXPECTED_BYTES="83111698"
    EXPECTED_MACHINE="AArch64"
    ;;
  *)
    die "unsupported architecture: $ARCH"
    ;;
esac

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v tar >/dev/null 2>&1 || die "tar is required"
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  die "sha256sum or shasum is required"
fi

TMP_ROOT="${TMPDIR:-/tmp}"
WORK_DIR="$(mktemp -d "${TMP_ROOT%/}/cursor-agent-fetch.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="$WORK_DIR/agent-cli-package.tar.gz"
STAGING="$WORK_DIR/staging"
URL="${BASE_URL}/${CURSOR_ARCH}/agent-cli-package.tar.gz"

curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
  --output "$ARCHIVE" "$URL"

ACTUAL_BYTES="$(wc -c < "$ARCHIVE" | tr -d '[:space:]')"
[ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ] || \
  die "content length mismatch for $URL: got $ACTUAL_BYTES, expected $EXPECTED_BYTES"

ACTUAL_SHA256="$("${SHA256[@]}" "$ARCHIVE" | awk '{print $1}')"
[ "$ACTUAL_SHA256" = "$EXPECTED_SHA256" ] || \
  die "sha256 mismatch for $URL: got $ACTUAL_SHA256, expected $EXPECTED_SHA256"

# Reject absolute or parent-directory entries before stripping the archive's
# dist-package prefix. This is a cheap defense against a corrupt/malicious
# archive escaping the staging directory.
if tar --list --file "$ARCHIVE" | awk '
  /(^|\/)\.\.(\/|$)/ || /^\// { bad = 1 }
  END { exit bad }
'; then
  :
else
  die "unsafe path in archive: $URL"
fi

mkdir "$STAGING"
tar --extract --gzip --file "$ARCHIVE" --strip-components=1 --directory "$STAGING"
[ -x "$STAGING/cursor-agent" ] || die "cursor-agent launcher missing or not executable"
[ -x "$STAGING/node" ] || die "bundled node executable missing or not executable"

INSTALLED_VERSION="$("$STAGING/cursor-agent" --disable-auto-update --version)"
[ "$INSTALLED_VERSION" = "$VERSION" ] || \
  die "version mismatch: got $INSTALLED_VERSION, expected $VERSION"

[ ! -e "$DEST" ] || die "destination already exists: $DEST"
mkdir -p "$(dirname "$DEST")"
mv "$STAGING" "$DEST"

printf 'fetched Cursor Agent %s for %s\n' "$VERSION" "$ARCH"
printf 'sha256 %s\n' "$ACTUAL_SHA256"
printf 'launch %s/cursor-agent --disable-auto-update acp\n' "$DEST"
printf 'expected ELF machine %s\n' "$EXPECTED_MACHINE"
