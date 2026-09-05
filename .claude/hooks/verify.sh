#!/usr/bin/env sh
# Stop hook. The session does not end on a red gate: exit 2 sends Claude back to
# fix it. Two independent brakes keep that from looping — Claude Code's own
# stop_hook_active flag, and an attempt counter on disk in case the flag is absent.
set -eu

command -v jq >/dev/null 2>&1 || exit 0
jq -e '.scripts.check' package.json >/dev/null 2>&1 || exit 0

input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

attempts_file="${CLAUDE_PROJECT_DIR:-.}/.git/wolfchatter-verify-attempts"
attempts=$(cat "$attempts_file" 2>/dev/null || echo 0)

if check_output=$(npm run --silent check 2>&1); then
	rm -f "$attempts_file"
	exit 0
fi

if [ "$attempts" -ge 2 ]; then
	rm -f "$attempts_file"
	echo "npm run check is still failing after $attempts attempts. Stopping so Radu can look at it." >&2
	exit 0
fi

echo "$((attempts + 1))" >"$attempts_file"
printf '%s\n' "$check_output" >&2
echo "npm run check failed. Fix it before finishing, or tell Radu why it cannot be fixed." >&2
exit 2
