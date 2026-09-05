#!/usr/bin/env sh
# PreToolUse. Blocks the two things no approval flow should have to catch by hand:
# writing to a file that is evidence or a secret, and rewriting shared history.
# Exit 2 blocks the call and hands the reason back to Claude.
#
# No package.json guard here: what this protects exists before the scaffold does.
set -eu

if ! command -v jq >/dev/null 2>&1; then
	echo "protect-files: jq is missing, so this guard cannot read the tool input; install jq or remove the hook from .claude/settings.json" >&2
	exit 2
fi

input=$(cat)
edited_file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
bash_command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
project_dir=${CLAUDE_PROJECT_DIR:-.}

block() {
	echo "Blocked: $1" >&2
	exit 2
}

if [ -n "$edited_file" ]; then
	path=${edited_file#"$project_dir"/}
	case "$path" in
	.env | .env.*)
		[ "$path" = ".env.example" ] || block "$path holds local configuration and is git-ignored. Document the variable in .env.example instead."
		;;
	package-lock.json)
		block "package-lock.json is written by npm, not by hand. Run npm install."
		;;
	.git/*)
		block "$path is git's own state. Use a git command."
		;;
	docs/self-review/*.raw.json | docs/self-review/round-*.md | docs/audit/raw/*)
		block "$path is review evidence. It is produced by scripts/review.sh and the audit scripts, and editing it would rewrite the record."
		;;
	apps/server/src/db/migrations/*.sql)
		[ ! -f "$project_dir/$path" ] || block "$path has already been applied. A schema change is a new numbered migration."
		;;
	esac
fi

# Split the command first: judging the whole line would read the -f of an unrelated
# `pkill -f` as a force push and block a commit that was never one.
push_commands=$(printf '%s\n' "$bash_command" | tr ';|&' '\n' | grep -F 'git push' || [ $? -eq 1 ])
case "$push_commands" in
*--force* | *" -f "* | *" -f" | *" +"*)
	block "force push. Rewriting a shared branch is Radu's call, made by hand, never the tooling's."
	;;
esac

exit 0
