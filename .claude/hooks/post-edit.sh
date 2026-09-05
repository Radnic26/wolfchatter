#!/usr/bin/env sh
# PostToolUse. Formats, lints and type-checks the file that was just written, so a
# mistake is corrected in the same turn instead of surfacing at the next gate.
# PostToolUse cannot block, but exit 2 puts stderr in front of Claude.
set -eu

[ -f package.json ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

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

if ! biome_output=$(npx --no-install biome check --write "$edited_file" 2>&1); then
	printf '%s\n' "$biome_output" >&2
	exit 2
fi

if ! typecheck_output=$(npm run --silent typecheck --workspace "$workspace" 2>&1); then
	printf '%s\n' "$typecheck_output" >&2
	exit 2
fi

exit 0
