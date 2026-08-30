#!/bin/sh
set -eu

mode=${1:-no-marker}
requested_arch=${2:-$(uname -m)}
case "$mode" in
  no-marker) marker_option=false ;;
  write-marker) marker_option=true ;;
  *)
    echo "usage: $0 [no-marker|write-marker] [amd64|aarch64]" >&2
    exit 2
    ;;
esac

case "$requested_arch" in
  arm64|aarch64) image_arch=aarch64; platform=linux/arm64 ;;
  x86_64|amd64) image_arch=amd64; platform=linux/amd64 ;;
  *) echo "unsupported architecture" >&2; exit 2 ;;
esac

image="hass-conx-spike-008:${image_arch}-0.1.4"
name="hass-conx-spike-008-smoke-$$"
config_volume="hass-conx-spike-008-config-$$"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/hass-conx-spike-008.XXXXXX")
docker volume create "$config_volume" >/dev/null
cleanup() {
  docker rm --force "$name" >/dev/null 2>&1 || true
  docker volume rm "$config_volume" >/dev/null 2>&1 || true
  rm -rf "$temporary"
}
trap cleanup EXIT INT TERM

mkdir -p "$temporary/data"
# Match the protected-host observation: /config is root:root 0775. The
# container entrypoint prepares this fixture before launching the backend as
# UID 1000 and the provider-shaped probe as capability-free UID 0.
docker run --rm --platform "$platform" --volume "$config_volume:/config" --entrypoint /bin/sh "$image" \
  -c 'printf "# disposable smoke fixture\n" > /config/configuration.yaml && mkdir -p /config/.storage && chown -R 0:0 /config && chmod 0775 /config /config/.storage && chmod 0644 /config/configuration.yaml'
chmod 0777 "$temporary/data"
printf '{"write_marker":%s}\n' "$marker_option" > "$temporary/data/options.json"
chmod 0600 "$temporary/data/options.json"

# Deliberately publish no host port. Ingress is supplied by Supervisor on HA.
docker run --detach --name "$name" \
  --platform "$platform" \
  --volume "$config_volume:/config" \
  --volume "$temporary/data:/data" \
  "$image" >/dev/null

ready=0
for attempt in $(seq 1 600); do
  if test -s "$temporary/data/spike-008/provider-probe.json"; then
    ready=1
    break
  fi
  sleep 0.1
done
if test "$ready" -ne 1; then
  echo "provider probe did not finish" >&2
  docker logs "$name" >&2 || true
  exit 1
fi

python3 - "$temporary/data/spike-008/backend-probe.json" "$temporary/data/spike-008/provider-probe.json" "$marker_option" <<'PY'
import json
import pathlib
import sys

backend = json.loads(pathlib.Path(sys.argv[1]).read_text())
provider = json.loads(pathlib.Path(sys.argv[2]).read_text())
marker_option = sys.argv[3] == "true"
assert backend["uid"] == 1000, backend
assert backend["gid"] == 1000, backend
assert provider["uid"] == 0, provider
assert provider["gid"] == 0, provider
assert provider["supplementary_gids"] == [], provider
assert provider["capability_observations"]["status"] == "ok", provider
for field in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"):
    assert provider["capability_observations"]["fields"][field] == "0000000000000000", provider
assert provider["capability_observations"]["fields"]["NoNewPrivs"] == "1", provider
assert provider["distinct_uids"], provider
assert provider["provider_home_writable"], provider
assert provider["config_readable"], provider
assert not backend["config_writable"], backend
assert provider["config_writable"], provider
assert backend["config_metadata"] == {"uid": 0, "gid": 0, "mode": "0775"}, backend
assert provider["config_metadata"] == {"uid": 0, "gid": 0, "mode": "0775"}, provider
assert backend["config_target_observations"]["/config/configuration.yaml"]["readable"], backend
assert provider["config_target_observations"]["/config/configuration.yaml"]["readable"], provider
assert not backend["config_target_observations"]["/config/configuration.yaml"]["writable"], backend
assert provider["config_target_observations"]["/config/configuration.yaml"]["writable"], provider
assert not backend["config_target_observations"]["/config/.storage"]["writable"], backend
assert provider["config_target_observations"]["/config/.storage"]["writable"], provider
for operation in ("direct_overwrite", "create", "rename", "delete", "atomic_replace_symlink"):
    assert provider["synthetic_filesystem_test"][operation]["status"] == "pass", provider
assert not provider["synthetic_filesystem_test"]["atomic_replace_symlink"]["entry_is_symlink_after"], provider
assert provider["synthetic_filesystem_test"]["atomic_replace_symlink"]["target_unchanged"], provider
assert provider["bubblewrap"]["read_only_workspace"]["status"] == "blocked_by_namespace_startup", provider
assert provider["bubblewrap"]["workspace_write"]["status"] == "blocked_by_namespace_startup", provider
assert not provider["backend_secret_readable"], provider
assert not provider["backend_process_environment_readable"], provider
assert not provider["provider_environment_contains_backend_secret"], provider
assert not provider["provider_environment_contains_supervisor_token"], provider
assert backend["marker_requested"] is marker_option, backend
assert provider["marker_requested"] is marker_option, provider
assert provider["marker"] == ("created" if marker_option else "not_requested"), provider
if marker_option:
    assert provider["marker_metadata"] == {"uid": 0, "gid": 0, "mode": "0644"}, provider
else:
    assert provider["marker_metadata"]["error_class"] == "FileNotFoundError", provider
assert backend["marker"] == ("provider_opt_in_pending" if marker_option else "not_requested"), backend
print(json.dumps({"backend": backend, "provider": provider}, sort_keys=True))
PY

filesystem_test_cleaned=0
for attempt in $(seq 1 100); do
  if docker exec "$name" /usr/bin/test ! -e /config/.hass-conx-spike-008-root-fs-test; then
    filesystem_test_cleaned=1
    break
  fi
  sleep 0.1
done
test "$filesystem_test_cleaned" -eq 1

marker_present=$(docker run --rm --platform "$platform" --volume "$config_volume:/config" --entrypoint /bin/sh "$image" \
  -c 'test -f /config/.hass-conx-spike-008-marker && echo yes || echo no')
if test "$marker_option" = true; then
  test "$marker_present" = yes
  marker_metadata=$(docker run --rm --platform "$platform" --volume "$config_volume:/config" --entrypoint /usr/bin/stat "$image" \
    -c '%u:%g:%a' /config/.hass-conx-spike-008-marker)
  test "$marker_metadata" = 0:0:644
else
  test "$marker_present" = no
fi

direct_status=$(docker exec "$name" /usr/bin/python3 -c \
  'import urllib.error,urllib.request; r=urllib.request.Request("http://127.0.0.1:8099/result.json");
try:
  urllib.request.urlopen(r, timeout=2); print("unexpected_200")
except urllib.error.HTTPError as e:
  print(e.code)')
test "$direct_status" = 403
echo "direct_local_request=$direct_status"
