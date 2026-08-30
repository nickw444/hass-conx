#!/bin/sh
set -eu

image=hass-conx-spike-003
root_dir=$(mktemp -d)
config_dir="$root_dir/config"
mkdir -p "$config_dir"
chmod 0777 "$config_dir"

cleanup() {
  rm -rf "$root_dir"
}
trap cleanup EXIT INT TERM

docker build --tag "$image" "$(dirname "$0")"

printf '\n[same user; inherited environment]\n'
docker run --rm \
  --volume "$config_dir:/config" \
  "$image" sh -c 'mkdir -p /run/secrets && printf synthetic-not-a-secret > /run/secrets/ha-token && chown 1000:1000 /run/secrets/ha-token && chmod 0600 /run/secrets/ha-token && setpriv --reuid=1000 --regid=1000 --clear-groups env SUPERVISOR_TOKEN=synthetic-not-a-secret probe.sh same-user-inherited'

printf '\n[same user; scrubbed child environment, token held by peer process]\n'
docker run --rm \
  --volume "$config_dir:/config" \
  "$image" sh -c 'mkdir -p /run/secrets && printf synthetic-not-a-secret > /run/secrets/ha-token && chown 1000:1000 /run/secrets/ha-token && chmod 0600 /run/secrets/ha-token && setpriv --reuid=1000 --regid=1000 --clear-groups env SUPERVISOR_TOKEN=synthetic-not-a-secret sh -c "sleep 30 & env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/app probe.sh same-user-scrubbed"'

printf '\n[separate user; scrubbed environment]\n'
docker run --rm \
  --volume "$config_dir:/config" \
  "$image" sh -c 'mkdir -p /run/secrets && printf synthetic-not-a-secret > /run/secrets/ha-token && chown 1000:1000 /run/secrets/ha-token && chmod 0600 /run/secrets/ha-token && env SUPERVISOR_TOKEN=synthetic-not-a-secret sleep 30 & setpriv --reuid=1001 --regid=1001 --clear-groups env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/agent probe.sh separate-user-scrubbed'

printf '\n[bubblewrap under default Docker confinement]\n'
if docker run --rm \
  --user 1001:1001 \
  --volume "$config_dir:/config" \
  "$image" bwrap \
    --unshare-all \
    --die-with-parent \
    --ro-bind / / \
    --dev /dev \
    --proc /proc \
    --tmpfs /tmp \
    --bind /config /config \
    --setenv PATH /usr/local/bin:/usr/bin:/bin \
    --setenv HOME /home/agent \
    probe.sh bubblewrap-default; then
  printf 'bubblewrap_default=result-success\n'
else
  printf 'bubblewrap_default=result-failure\n'
fi

printf '\n[bubblewrap with SYS_ADMIN added for diagnostic comparison]\n'
if docker run --rm \
  --cap-add SYS_ADMIN \
  --security-opt apparmor=unconfined \
  --security-opt seccomp=unconfined \
  --user 1001:1001 \
  --volume "$config_dir:/config" \
  "$image" bwrap \
    --unshare-all \
    --die-with-parent \
    --ro-bind / / \
    --dev /dev \
    --proc /proc \
    --tmpfs /tmp \
    --bind /config /config \
    --setenv PATH /usr/local/bin:/usr/bin:/bin \
    --setenv HOME /home/agent \
    probe.sh bubblewrap-sys-admin; then
  printf 'bubblewrap_sys_admin=result-success\n'
else
  printf 'bubblewrap_sys_admin=result-failure\n'
fi
