#!/usr/bin/env sh
# Reproducible self-review: the same prompt, the same criteria, the same read-only
# tools every time, with the result validated against scripts/review-schema.json.
# The interactive path is /self-review <round>; this is the one that leaves a record.
#
# Usage: ./scripts/review.sh [round]
set -eu

round=${1:-1}
case "$round" in
'' | *[!0-9]*)
	echo "usage: $0 [round]   (round must be a positive integer)" >&2
	exit 64
	;;
esac

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
schema_file="$repository_root/scripts/review-schema.json"
output_directory="$repository_root/docs/self-review"
raw_output="$output_directory/round-$round.raw.json"

for tool in claude jq; do
	command -v "$tool" >/dev/null 2>&1 || {
		echo "$tool is required and is not on PATH" >&2
		exit 69
	}
done

mkdir -p "$output_directory"

echo "Reviewing round $round with $(claude --version) on branch $(git -C "$repository_root" rev-parse --abbrev-ref HEAD)" >&2

claude_status=0
claude -p "/self-review $round" \
	--output-format json \
	--json-schema "$(cat "$schema_file")" \
	--allowedTools "Read" "Grep" "Glob" "Bash(git diff *)" "Bash(git log *)" "Bash(git status *)" "Bash(npm run typecheck *)" "Bash(npm test *)" \
	--max-turns 40 \
	>"$raw_output" || claude_status=$?

if [ "$claude_status" -ne 0 ] && ! jq -e . "$raw_output" >/dev/null 2>&1; then
	echo "claude exited $claude_status without a JSON result. Raw output in $raw_output" >&2
	exit 1
fi

# A run can end successfully and still carry no findings object, which is a failed
# review rather than a clean one. Treat the two apart before anyone reads the report.
subtype=$(jq -r '.subtype // "missing"' "$raw_output")
if [ "$subtype" != "success" ]; then
	echo "Review did not complete: subtype $subtype. Raw output in $raw_output" >&2
	exit 1
fi

if [ "$(jq -r 'has("structured_output") and .structured_output != null' "$raw_output")" != "true" ]; then
	echo "Review completed without structured output, so nothing was validated against the schema. Raw output in $raw_output" >&2
	exit 1
fi

jq '.structured_output' "$raw_output"
echo "Raw result in $raw_output" >&2
