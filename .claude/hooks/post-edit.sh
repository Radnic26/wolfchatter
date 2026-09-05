#!/usr/bin/env sh
# PostToolUse. Formats, lints and type-checks the file that was just written, so a
# mistake is corrected in the same turn instead of surfacing at the next gate.
# PostToolUse cannot block, but exit 2 puts stderr in front of Claude.
set -eu

command -v jq >/dev/null 2>&1 || exit 0
jq -e '.scripts.typecheck' package.json >/dev/null 2>&1 || exit 0

edited_file=$(cat | jq -r '.tool_input.file_path // empty')
[ -n "$edited_file" ] || exit 0

case "$edited_file" in
*.ts | *.tsx) ;;
*) exit 0 ;;
esac
[ -f "$edited_file" ] || exit 0

path=${edited_file#"${CLAUDE_PROJECT_DIR:-.}"/}
case "$path" in
apps/server/*) workspace=apps/server ;;
apps/web/*) workspace=apps/web ;;
packages/shared/*) workspace=packages/shared ;;
*) exit 0 ;;
esac

# --no-errors-on-unmatched: a file Biome does not own is not a failure.
if ! biome_output=$(npx --no-install biome check --write --no-errors-on-unmatched "$edited_file" 2>&1); then
	printf '%s\n' "$biome_output" >&2
	exit 2
fi

# --if-present: during the scaffold a workspace can legitimately exist before its scripts do.
if ! typecheck_output=$(npm run typecheck --workspace "$workspace" --if-present 2>&1); then
	printf '%s\n' "${typecheck_output:-"npm run typecheck --workspace $workspace failed without output"}" >&2
	exit 2
fi

exit 0
