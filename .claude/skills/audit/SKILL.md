---
name: audit
description: Run the deploy-readiness audit against the running application and report its findings. Invoked by hand, never automatically.
disable-model-invocation: true
context: fork
agent: auditor
allowed-tools: Read, Grep, Glob, Bash(scripts/audit/*), Bash(scripts/load/*), Bash(curl *), Bash(npm audit *), Bash(docker scout *), Bash(docker compose *), Bash(docker stats *), Bash(docker logs *), Bash(git log *), Bash(git grep *), Bash(npx lighthouse *)
argument-hint: [round-number] [security|load|performance|all]
---

Audit round $0, track ${1:-all}, against the application running on http://localhost:3000.

## The application under test

!`docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || echo "nothing running: start it with docker compose up --build"`

## Findings already on record

Do not repeat one of these. If it still holds, say so and cite its existing id; if it is gone, mark it
fixed and give the measurement that shows it.

!`cat docs/audit/README.md 2>/dev/null || echo "none yet"`

## The self-review's record, for the same reason

!`sed -n '/^| id | sev |/,/^$/p' docs/self-review/README.md 2>/dev/null || echo "none yet"`

## What to produce

Apply the auditor procedure for the requested track, or for all three in the order security, load,
performance. Return the findings in the finding format, ids numbered `A$0-1`, `A$0-2`, and so on,
ordered by severity within each track. Do not write a file and do not fix anything: these are
proposals for Radu, and `scripts/audit.sh` is what commits them.
