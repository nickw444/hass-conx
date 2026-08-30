#!/usr/bin/env bash
# Ingest GitHub work into agent-team without a public webhook.
#
# Preferred source: Projects v2 items whose Status is github.agent_column
# ("Ready for Agent"). Fallback: open issues labeled ready-for-agent.
# Idempotent: skips tickets that already have a non-terminal durable job.
set -euo pipefail

ROOT="$(git -C "${BASH_SOURCE[0]%/*}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
cd "$ROOT"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

for bin in gh agent-team python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "github-intake-poll: $bin is required" >&2; exit 1; }
done

eval "$(python3 - <<'PY'
import tomllib
from pathlib import Path
cfg = tomllib.loads(Path(".agent_team/config.toml").read_text())
g = cfg.get("github", {})
def emit(k, v):
    print(f"{k}={str(v or '')!r}")
emit("OWNER", g.get("owner") or "nickw444")
emit("REPO", g.get("repo") or "hass-conx")
emit("PROJECT_OWNER", g.get("project_owner") or g.get("owner") or "nickw444")
emit("PROJECT_NUMBER", g.get("project_number") or 0)
emit("STATUS_FIELD", g.get("project_status_field") or "Status")
emit("AGENT_COLUMN", g.get("agent_column") or "Ready for Agent")
labels = g.get("labels") or ["ready-for-agent"]
emit("LABEL", labels[0] if labels else "ready-for-agent")
PY
)"

PROJECT_JSON=""
if [[ -n "$PROJECT_NUMBER" && "$PROJECT_NUMBER" != "0" ]]; then
  if PROJECT_JSON="$(gh api graphql -f query='
    query($login: String!, $number: Int!, $field: String!) {
      user(login: $login) {
        projectV2(number: $number) {
          title
          items(first: 50) {
            nodes {
              fieldValueByName(name: $field) {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              content {
                ... on Issue { number title url repository { nameWithOwner } }
              }
            }
          }
        }
      }
    }
  ' -f login="$PROJECT_OWNER" -F number="$PROJECT_NUMBER" -f field="$STATUS_FIELD" 2>/tmp/github-intake-project.err)"; then
    :
  else
    echo "github-intake-poll: project query failed (label fallback): $(tr '\n' ' ' </tmp/github-intake-project.err)" >&2
    PROJECT_JSON=""
  fi
fi

TICKETS_JSON="$(
  PROJECT_JSON="$PROJECT_JSON" python3 - "$OWNER" "$REPO" "$AGENT_COLUMN" "$LABEL" <<'PY'
import json, os, subprocess, sys

owner, repo, agent_column, label = sys.argv[1:5]
want_repo = f"{owner}/{repo}".lower()
tickets = {}
source = "none"
raw = os.environ.get("PROJECT_JSON") or ""
if raw:
    data = json.loads(raw)
    project = (((data.get("data") or {}).get("user") or {}).get("projectV2")) or {}
    for node in ((project.get("items") or {}).get("nodes") or []):
        content = node.get("content") or {}
        number = content.get("number")
        if not number:
            continue
        repo_name = ((content.get("repository") or {}).get("nameWithOwner") or want_repo)
        if str(repo_name).lower() != want_repo:
            continue
        status = ((node.get("fieldValueByName") or {}) or {}).get("name") or ""
        if status != agent_column:
            continue
        tickets[str(number)] = {
            "number": str(number),
            "title": content.get("title") or "",
            "url": content.get("url") or f"https://github.com/{repo_name}/issues/{number}",
            "status": status,
        }
    if project:
        source = "project"

if not tickets:
    listed = subprocess.check_output(
        [
            "gh", "issue", "list", "--repo", f"{owner}/{repo}",
            "--label", label, "--state", "open", "--limit", "50",
            "--json", "number,title,url",
        ],
        text=True,
    )
    for issue in json.loads(listed or "[]"):
        number = str(issue["number"])
        tickets[number] = {
            "number": number,
            "title": issue.get("title") or "",
            "url": issue.get("url") or "",
            "status": agent_column,
        }
    if tickets:
        source = "label"

print(json.dumps({"source": source, "tickets": list(tickets.values())}))
PY
)"

SOURCE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["source"])' "$TICKETS_JSON")"
COUNT="$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])["tickets"]))' "$TICKETS_JSON")"
echo "github-intake-poll: source=$SOURCE tickets=$COUNT column=$AGENT_COLUMN project=$PROJECT_OWNER/$PROJECT_NUMBER"

if [[ "$COUNT" == "0" ]]; then
  echo "github-intake-poll: nothing in '$AGENT_COLUMN' and no open issues labeled $LABEL"
  exit 0
fi

published=0
skipped=0
while IFS=$'\t' read -r number title url status; do
  existing="$(agent-team job ls --ticket "$number" --json 2>/dev/null || echo '[]')"
  active="$(python3 -c '
import json, sys
jobs = json.loads(sys.stdin.read() or "[]")
if isinstance(jobs, dict):
    jobs = jobs.get("jobs", jobs.get("items", []))
active = [j for j in jobs if str(j.get("status", "")).lower() not in ("done", "failed", "")]
print(len(active))
' <<<"$existing")"
  if [[ "$active" != "0" ]]; then
    echo "github-intake-poll: skip #$number (active job exists)"
    skipped=$((skipped + 1))
    continue
  fi
  echo "github-intake-poll: dispatch #$number — $title"
  args=(ticket.status_changed "ticket=$number" "status=$status" "ticket_url=$url" "title=$title" "source=github")
  if [[ "$DRY_RUN" -eq 1 ]]; then
    agent-team event publish "${args[@]}" --dry-run --trace
    continue
  fi
  agent-team event publish "${args[@]}"
  published=$((published + 1))
done < <(python3 -c '
import json,sys
for t in json.loads(sys.argv[1])["tickets"]:
    print("\t".join([t["number"], t["title"].replace("\t"," "), t["url"], t["status"]]))
' "$TICKETS_JSON")

echo "github-intake-poll: published=$published skipped=$skipped dry_run=$DRY_RUN"
