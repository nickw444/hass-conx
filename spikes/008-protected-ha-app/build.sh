#!/bin/sh
set -eu

requested_arch=${1:-}
case "${requested_arch:-$(uname -m)}" in
  amd64|x86_64) image_arch=amd64; platform=linux/amd64 ;;
  aarch64|arm64) image_arch=aarch64; platform=linux/arm64 ;;
  *)
    echo "usage: $0 [amd64|aarch64]" >&2
    exit 2
    ;;
esac

image="hass-conx-spike-008:${image_arch}-0.1.4"
docker build \
  --platform "$platform" \
  --build-arg BUILD_VERSION=0.1.4 \
  --build-arg BUILD_ARCH="$image_arch" \
  --tag "$image" \
  "$(dirname "$0")"
echo "$image"
