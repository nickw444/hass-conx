#!/bin/sh
set -eu

label=${1:-unknown}

printf 'case=%s\n' "$label"
printf 'uid=%s gid=%s\n' "$(id -u)" "$(id -g)"

if test -w /config; then
  printf 'config_write=allowed\n'
  printf '%s\n' "$label" > "/config/probe-$label.txt"
else
  printf 'config_write=denied\n'
fi

if test -r /run/secrets/ha-token; then
  printf 'secret_file=readable\n'
else
  printf 'secret_file=unreadable\n'
fi

if env | grep -q '^SUPERVISOR_TOKEN='; then
  printf 'own_environment_token=visible\n'
else
  printf 'own_environment_token=absent\n'
fi

proc_token=absent
for environ in /proc/[0-9]*/environ; do
  if test -r "$environ" && tr '\000' '\n' < "$environ" 2>/dev/null | grep -q '^SUPERVISOR_TOKEN='; then
    proc_token=visible
    break
  fi
done
printf 'other_process_token=%s\n' "$proc_token"
