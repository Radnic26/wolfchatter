#!/usr/bin/env sh
# Reproducible deploy-readiness audit: the same prompt, the same criteria, the same tools
# every time, with the result validated against scripts/audit-schema.json. The interactive
# path is /audit <round> [track]; this is the one that leaves a record.
#
# The application must already be running under docker compose, because the audit measures
# the production image against a real PostgreSQL, not the development server.
#
# Usage: ./scripts/audit.sh [round] [security|load|performance|all]
set -eu

round=${1:-1}
track=${2:-all}
case "$round" in
'' | *[!0-9]*)
	echo "usage: $0 [round] [security|load|performance|all]   (round must be a positive integer)" >&2
	exit 64
	;;
esac
case "$track" in
security | load | performance | all) ;;
*)
	echo "usage: $0 [round] [security|load|performance|all]   (unknown track $track)" >&2
	exit 64
	;;
esac

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
schema_file="$repository_root/scripts/audit-schema.json"
output_directory="$repository_root/docs/audit/raw"
raw_output="$output_directory/round-$round.$track.raw.json"

for tool in claude jq; do
	command -v "$tool" >/dev/null 2>&1 || {
		echo "$tool is required and is not on PATH" >&2
		exit 69
	}
done

# An audit against nothing running would report a clean application, which is the one
# result worse than a failing one.
health=$(curl -fsS -m 5 http://localhost:3000/api/health 2>/dev/null || true)
case "$health" in
*'"ok"'*) ;;
*)
	echo "Nothing is answering on http://localhost:3000. Start it with: docker compose up --build" >&2
	exit 69
	;;
esac

mkdir -p "$output_directory"

echo "Auditing round $round, track $track, with $(claude --version) on branch $(git -C "$repository_root" rev-parse --abbrev-ref HEAD)" >&2

claude_status=0
claude -p "/audit $round $track" \
	--output-format json \
	--json-schema "$(cat "$schema_file")" \
	--allowedTools "Read" "Grep" "Glob" "Bash(scripts/audit/*)" "Bash(scripts/load/*)" "Bash(curl *)" "Bash(npm audit *)" "Bash(docker scout *)" "Bash(docker compose *)" "Bash(docker stats *)" "Bash(docker logs *)" "Bash(git log *)" "Bash(git grep *)" "Bash(npx lighthouse *)" \
	--max-turns 60 \
	>"$raw_output" || claude_status=$?

if [ "$claude_status" -ne 0 ] && ! jq -e . "$raw_output" >/dev/null 2>&1; then
	echo "claude exited $claude_status without a JSON result. Raw output in $raw_output" >&2
	exit 1
fi

# A run can end successfully and still carry no findings object, which is a failed audit
# rather than a clean one. Treat the two apart before anyone reads the report.
subtype=$(jq -r '.subtype // "missing"' "$raw_output")
if [ "$subtype" != "success" ]; then
	echo "Audit did not complete: subtype $subtype. Raw output in $raw_output" >&2
	exit 1
fi

if [ "$(jq -r 'has("structured_output") and .structured_output != null' "$raw_output")" != "true" ]; then
	echo "Audit completed without structured output, so nothing was validated against the schema. Raw output in $raw_output" >&2
	exit 1
fi

jq '.structured_output' "$raw_output"
echo "Raw result in $raw_output" >&2
