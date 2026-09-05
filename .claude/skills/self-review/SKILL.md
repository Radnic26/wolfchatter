---
name: self-review
description: Run the independent reviewer over the current branch and report its findings. Invoked by hand, never automatically.
disable-model-invocation: true
context: fork
agent: reviewer
allowed-tools: Read, Grep, Glob, Bash(git diff *), Bash(git log *), Bash(git status *), Bash(npm run typecheck *), Bash(npm test *)
argument-hint: [round-number]
---

Review round $0 of the current branch against `main`.

## Changed files

!`git diff main...HEAD --stat`

## Findings already on record

Do not repeat one of these. If it is still present, say so and cite its existing id; if it is gone, mark it fixed.

!`cat docs/self-review/round-*.md 2>/dev/null || echo "none yet"`

## What to produce

Apply the reviewer procedure and return the findings in the finding format, ids numbered `R$0-1`, `R$0-2`, and so on, ordered by severity. Do not write a file and do not fix anything: these are proposals for Radu, and `scripts/review.sh` is what commits them.
