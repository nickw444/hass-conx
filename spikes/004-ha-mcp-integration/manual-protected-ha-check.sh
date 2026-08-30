#!/usr/bin/env bash
set -euo pipefail

# Run this only inside the intended Home Assistant app/container or a trusted
# shell. SUPERVISOR_TOKEN is read, never printed, and is not written to disk.
: "${SUPERVISOR_TOKEN:?Set SUPERVISOR_TOKEN in the protected validation environment}"
: "${HA_MCP_URL:=http://supervisor/core/api/mcp/assist}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

post_mcp() {
  local payload="$1"
  local body="$work_dir/body"
  local headers="$work_dir/headers"
  local status
  status="$(curl --silent --show-error --no-progress-meter \
    --output "$body" --dump-header "$headers" --write-out '%{http_code}' \
    --request POST "$HA_MCP_URL" \
    --header "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    --header 'Accept: application/json, text/event-stream' \
    --header 'Content-Type: application/json' \
    --header 'MCP-Protocol-Version: 2025-06-18' \
    --data "$payload")"
  printf '%s\n' "$status"
}

initialize='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"hass-conx-protected-check","version":"0.1.0"}}}'
status="$(post_mcp "$initialize")"
printf 'initialize HTTP status: %s\n' "$status"
case "$status" in
  200|202) ;;
  401) echo 'Authentication rejected (check the protected runtime token and app permission).' >&2; exit 1 ;;
  404) echo 'MCP endpoint not configured or API id is unavailable.' >&2; exit 1 ;;
  *) echo 'Unexpected MCP initialize response; inspect only the local temporary body.' >&2; exit 1 ;;
esac

# The official HA integration is stateless today, but preserve a session id if
# a deployment chooses a stateful transport.
session_id="$(awk 'BEGIN { IGNORECASE=1 } /^Mcp-Session-Id:/ { gsub("\r", "", $2); print $2 }' "$work_dir/headers" | tail -n 1)"
if [[ -n "$session_id" ]]; then
  printf 'MCP session: present (value withheld)\n'
else
  printf 'MCP session: stateless\n'
fi

initialized='{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
session_header=()
if [[ -n "$session_id" ]]; then
  session_header+=(--header "Mcp-Session-Id: ${session_id}")
fi
notify_status="$(curl --silent --show-error --no-progress-meter \
  --output /dev/null --write-out '%{http_code}' \
  --request POST "$HA_MCP_URL" \
  --header "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --header 'MCP-Protocol-Version: 2025-06-18' \
  "${session_header[@]}" \
  --data "$initialized")"
printf 'initialized notification HTTP status: %s\n' "$notify_status"

tools='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
session_header=()
if [[ -n "$session_id" ]]; then
  session_header+=(--header "Mcp-Session-Id: ${session_id}")
fi
tools_status="$(curl --silent --show-error --no-progress-meter \
  --output "$work_dir/tools" --write-out '%{http_code}' \
  --request POST "$HA_MCP_URL" \
  --header "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --header 'MCP-Protocol-Version: 2025-06-18' \
  "${session_header[@]}" \
  --data "$tools")"
printf 'tools/list HTTP status: %s\n' "$tools_status"
if [[ "$tools_status" == 200 || "$tools_status" == 202 ]]; then
  printf 'exposed tool names (descriptions and URLs omitted):\n'
  jq -r '.result.tools[]?.name // empty' "$work_dir/tools"
else
  echo 'tools/list failed; do not retry repeatedly with a possibly invalid token.' >&2
  exit 1
fi

cat <<'CHECKLIST'

Read-only gate passed. Before any write test:
  1. Confirm the returned tools are restricted to the explicitly exposed test entity.
  2. Create/identify a disposable input_boolean.hass_conx_spike in Home Assistant.
  3. Call the exposed service tool to turn that helper on; read its state; turn it off; read again.
  4. Confirm the final state is off and remove the helper if it was created only for this test.
  5. Repeat through the broker and each authenticated ACP provider. Never put SUPERVISOR_TOKEN or a direct HA URL in provider-facing ACP mcpServers.
CHECKLIST
