#!/usr/bin/env bash
# Smoke gate: require GitHub Actions on the job PR when workflows exist.
# With no workflows in the repo, pass and write evidence so empty repos can
# still clear verify until CI is added.
set -euo pipefail

EVIDENCE_DIR="${AGENT_TEAM_GATE_EVIDENCE_DIR:-${AGENT_TEAM_EVIDENCE_DIR:-.}}"
mkdir -p "$EVIDENCE_DIR"
REPORT="$EVIDENCE_DIR/ci-pr-checks.json"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

workflow_count=0
if [[ -d .github/workflows ]]; then
  workflow_count="$(find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) | wc -l | tr -d ' ')"
fi
if [[ "${workflow_count:-0}" -eq 0 ]]; then
  python3 - "$REPORT" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
path.write_text(json.dumps({
    "status": "pass",
    "reason": "no_workflows",
    "detail": "No .github/workflows files; CI gate is a no-op until workflows exist.",
}, indent=2) + "\n")
print("ci-pr-checks: no workflows configured; treating smoke CI gate as pass")
PY
  exit 0
fi

GH_AUTH="${AGENT_TEAM_ROOT:-$REPO_ROOT/.agent_team}/skills/github/scripts/github-auth.sh"
if [[ ! -x "$GH_AUTH" ]]; then
  echo "ci-pr-checks: missing github-auth helper at $GH_AUTH" >&2
  exit 1
fi

PR_URL=""
PR_NUMBER=""
if [[ -n "${AGENT_TEAM_JOB_ID:-}" ]] && command -v agent-team >/dev/null 2>&1; then
  job_json="$(agent-team job show "$AGENT_TEAM_JOB_ID" --json 2>/dev/null || true)"
  if [[ -n "$job_json" ]]; then
    PR_URL="$(python3 -c 'import json,sys; j=json.loads(sys.argv[1]); print(j.get("pr") or j.get("pr_url") or "")' "$job_json")"
  fi
fi

if [[ -z "$PR_URL" && -n "${AGENT_TEAM_BRANCH:-}" ]]; then
  PR_URL="$("$GH_AUTH" gh pr list --head "$AGENT_TEAM_BRANCH" --state open --json url --jq '.[0].url // empty' 2>/dev/null || true)"
fi

if [[ -z "$PR_URL" ]]; then
  python3 - "$REPORT" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({
    "status": "fail",
    "reason": "missing_pr",
    "detail": "Workflows exist but no PR URL/branch mapping was available for CI checks.",
}, indent=2) + "\n")
PY
  echo "ci-pr-checks: workflows exist but no PR was found for this job" >&2
  exit 1
fi

PR_NUMBER="$(basename "$PR_URL")"
echo "ci-pr-checks: waiting for checks on $PR_URL"

# Watch until checks complete; non-zero if any required check fails.
set +e
"$GH_AUTH" gh pr checks "$PR_NUMBER" --watch --fail-fast
status=$?
set -e

checks_json="$("$GH_AUTH" gh pr checks "$PR_NUMBER" --json name,state,bucket,link 2>/dev/null || echo '[]')"
python3 - "$REPORT" "$PR_URL" "$status" "$checks_json" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
pr_url = sys.argv[2]
exit_code = int(sys.argv[3])
checks = json.loads(sys.argv[4] or "[]")
path.write_text(json.dumps({
    "status": "pass" if exit_code == 0 else "fail",
    "reason": "pr_checks",
    "pr_url": pr_url,
    "exit_code": exit_code,
    "checks": checks,
}, indent=2) + "\n")
PY

exit "$status"
