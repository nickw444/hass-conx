#!/bin/sh
set -eu

probe_dir=/data/spike-008
filesystem_test_dir=/config/.hass-conx-spike-008-root-fs-test
cleanup() {
  rm -rf "$filesystem_test_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$probe_dir"
chmod 0777 "$probe_dir"
rm -f "$probe_dir/backend-probe.json" "$probe_dir/provider-probe.json" \
  "$probe_dir/backend-ready" "$probe_dir/backend.pid" \
  "$probe_dir/backend-uid" "$probe_dir/backend-synthetic-secret" \
  /home/backend/.hass-conx-spike-008-backend-synthetic-secret

# Supervisor owns /data/options.json. Read the single non-secret boolean while
# still under the entrypoint identity, validate it strictly, and pass only that
# value to the two isolated roles. Neither role needs the options file itself.
write_marker=false
if test -r /data/options.json; then
  write_marker=$(/usr/bin/python3 -c 'import json; value=json.load(open("/data/options.json", encoding="utf-8")); print("true" if value.get("write_marker") is True else "false")')
fi
case "$write_marker" in
  true|false) ;;
  *) write_marker=false ;;
esac

# Prepare only this dedicated synthetic tree while the entrypoint still has
# its initial app identity. No existing Home Assistant path is used as a write
# target. Cleanup below removes this fixed tree even if the provider probe
# exits unsuccessfully.
rm -rf "$filesystem_test_dir"
mkdir -p "$filesystem_test_dir"
printf 'direct-before\n' > "$filesystem_test_dir/direct-target"
printf 'rename-before\n' > "$filesystem_test_dir/rename-source"
printf 'delete-before\n' > "$filesystem_test_dir/delete-target"
printf 'symlink-target-before\n' > "$filesystem_test_dir/symlink-target"
ln -s symlink-target "$filesystem_test_dir/symlink-entry"
chown -R 0:0 "$filesystem_test_dir"
chmod 0755 "$filesystem_test_dir"
chmod 0644 "$filesystem_test_dir/direct-target" \
  "$filesystem_test_dir/rename-source" \
  "$filesystem_test_dir/delete-target" \
  "$filesystem_test_dir/symlink-target"

# The diagnostics HTTP backend is UID 1000 and the provider-shaped probe is
# capability-free UID 0. The provider receives an empty environment except for
# non-secret probe coordinates.
setpriv --reuid=1000 --regid=1000 --clear-groups \
  --bounding-set=-all --inh-caps=-all --ambient-caps=-all --securebits=+noroot \
  --no-new-privs \
  env HASS_CONX_BACKEND_SYNTHETIC_SECRET=synthetic-backend-secret-not-a-secret \
    WRITE_MARKER="$write_marker" \
  /usr/bin/python3 /opt/hass-conx-protected-ha-probe/backend_server.py \
  >/dev/null 2>&1 &
backend_pid=$!

ready=0
for attempt in $(seq 1 100); do
  if test -f "$probe_dir/backend-ready"; then
    ready=1
    break
  fi
  sleep 0.1
done
if test "$ready" -ne 1; then
  kill "$backend_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true
  exit 1
fi

provider_status=0
# The 0.1.4 experiment runs provider-shaped code as UID/GID 0/0 but removes
# every capability and the bounding set, enables securebits-noroot and
# NoNewPrivs, and supplies no supplementary groups. UID 0 therefore matches
# root-owned /config inode ownership without receiving host/container powers.
setpriv --reuid=0 --regid=0 --clear-groups \
  --bounding-set=-all --inh-caps=-all --ambient-caps=-all --securebits=+noroot \
  --no-new-privs \
  env -i \
    HOME=/home/provider \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    PYTHONUNBUFFERED=1 \
    BACKEND_PID="$backend_pid" \
    PROBE_DIR="$probe_dir" \
    FILESYSTEM_TEST_DIR="$filesystem_test_dir" \
    WRITE_MARKER="$write_marker" \
    /usr/bin/python3 /opt/hass-conx-protected-ha-probe/provider_probe.py \
    >/dev/null 2>&1 || provider_status=$?

rm -rf "$filesystem_test_dir"

# Keep the Ingress diagnostics server alive. A failed provider-shaped probe is
# represented in provider-probe.json rather than causing a misleading app
# restart loop.
wait "$backend_pid"
exit "$provider_status"
