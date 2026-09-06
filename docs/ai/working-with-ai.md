# Working with AI on this repository

Wolfchatter was built with Claude Code under a configuration that is committed here and was
committed before the first line of application code. This page says who decided what, how it
was checked, and where the numbers below come from.

Every figure on this page is produced by [`scripts/ai/collaboration-stats.ts`](../../scripts/ai/collaboration-stats.ts)
reading the session transcripts, or comes from a file in this repository. Re-run it and
disagree with it:

```sh
node scripts/ai/collaboration-stats.ts ~/.claude/projects/<dir>/<session>.jsonl ...
```

## Setup

Claude Code 2.1.259 to 2.1.261, across two models, split by the kind of work rather than
at random. Claude Fable 5.1 opened the project and did the planning — the research, the PRD,
the architecture notes, the delivery plan and the first draft of the configuration in the
table below — and came back later for the infrastructure estimate and the first half of the
self-review round. Claude Opus 5 carried the implementation, from the scaffold onward.
3,539 and 467 turns respectively. What is committed and what governs the agent:

| | |
|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | The standing rules: layout, conventions, the gate, the git approval rule, the code style |
| [`.claude/rules/`](../../.claude/rules) | Per-area rules the agent loads when it touches that area |
| [`.claude/agents/`](../../.claude/agents) | The independent reviewer and the auditor, each read-only, each in a fresh context |
| [`.claude/skills/`](../../.claude/skills) | The procedures for the self-review and audit rounds |
| [`.claude/settings.json`](../../.claude/settings.json) | Permissions: `ask` on commit, push and pull request; `deny` on merge and force-push |
| [`.githooks/`](../../.githooks) | The same gate locally, plus a hook that refuses anything shaped like a credential |
| [`scripts/review.sh`](../../scripts/review.sh), [`scripts/audit.sh`](../../scripts/audit.sh) | The two rounds, headless, output validated against a committed JSON schema |

Two rules are written into all of it. **Ask, never assume**: anything unclear in the PRD or
in a finding becomes a question to the author while the unambiguous part proceeds. **Propose,
never apply**: a finding is presented with its reproduction and is repaired only after the
author has understood and approved it. The practices here are aligned with the Claude
Certified Architect – Foundations blueprint.

## How the work was divided

Eleven sessions between 4 and 6 September 2026, in which the author sent **147 messages** and
the agent took **4,012 turns** — about 27 agent turns per instruction. That ratio is the
honest shape of the collaboration: direction and judgement on one side, execution on the
other. The counts are taken as this page was written; the last session was still running, so
re-running the script moves its figures by a few turns.

**The first day produced no application code.** The opening session, on Fable 5.1, ran three
research workflows — 26 agents, each finding handed to a second one told to disagree with it —
over the company's public writing, the fourteen public solutions to this same exercise since
2017, the current version of every candidate dependency, and the map tiles. That last one is
why the reference CodePen's dead tile URL was found on the first afternoon rather than halfway
through the map work. Out of it came the PRD, the architecture notes with their rejected
alternatives, the delivery plan and the first draft of the agent configuration, and the session
closed by initialising the repository with those documents as its first commit. It then stayed
open across all three days as the thread where scope was decided — the feature freeze on 5
September, the order of the last two rounds, what to leave out and why — which is why its
later turns are on Opus 5 while its planning turns are on Fable.

The author decided, in every case: the product and its scope; the stack and each rejected
alternative; the sequence of the pull requests and what each one contains; the
feature freeze on 5 September; whether each of the 44 review and audit findings was repaired,
declined or answered by correcting a document; and every merge. The first commit in the
repository is the PRD, the architecture and the delivery plan — the specification exists
before any code, and `git log --reverse` shows it.

The agent produced, under that direction: the implementation, the tests, the migrations, the
wizard, the probe and load instruments, and the first draft of every document, along with the
findings of both review rounds and the measurements behind them.

Tool calls, by category, across all eleven sessions: **1,795 shell**, 240 writing, 53 reading,
35 web, 26 other, and 9 that launched something — 4 subagents and 5 workflows. Reading looks
small because most of it went through the shell as well; a subagent and a workflow each keep
their own transcript, so the turns taken inside them are not in the counts above and cannot be
recovered from these files.

## Three corrections, and what each changed

**The rounds were reordered.** The plan had the audit before the self-review. The author swapped
them on 5 September: a review is the only step that finds correctness bugs by reading, so
running it first leaves a whole day to fix what it finds, and putting the audit last means its
measurements describe the code that actually ships. This rewrote row 10 and row 11 of
[`delivery-plan.md`](../delivery-plan.md), §6 of [`PRD.md`](../PRD.md) and §8 of
[`architecture.md`](../architecture.md), in the opening commit of the self-review branch. It
is why the numbers in the README are not stale.

**Two findings were declined under the freeze.** The self-review confirmed that a back-fill
request which never settles holds a room's live messages behind it, and that a `subscribe`
frame refused by the rate limit leaves the client and the hub disagreeing. Both are real. Both
were declined, because the repair is new behaviour with its own failure surface on the last
day of a project frozen since 5 September, and "out of scope, frozen on 5 September" is
recorded in [`docs/self-review/`](../self-review/) as the verdict rather than quietly fixed.

**An approved fix turned out not to exist.** Audit finding A1-2 said the 512 KiB slow-consumer
bound does not hold, with a measurement: a paused subscriber received all 5,000 messages and
3.3 MiB. The author approved a repair. Writing it showed why it could not be written —
`bufferedAmount` cannot see past the kernel's own send buffer, so a real bound needs either a
protocol acknowledgement or a flush deadline, and the deadline had already been declined in
the round before. The agent came back with that instead of inventing a mechanism, and the
author chose to make the code tell the truth: commit `6cba147` corrects the comment and records
the measured 3.3 MiB beside it.

## How it was checked

`npm run check` — Biome, `tsc --noEmit` per workspace, and Vitest with all four coverage
thresholds at 100% — runs locally through git hooks and in CI as one job per gate, and `main`
is protected on the job that fails unless every one of them passed. Nothing was ever committed
before the author had read the diff.

On top of the gate, two rounds against the finished code. The [self-review](../self-review/)
ran the committed reviewer configuration in a fresh context alongside `/code-review`, then an
adversarial verifier per candidate that was told to default to *refuted*: 83 candidates, 35
confirmed, 30 refuted, 20 collapsed as restatements. The [audit](../audit/) sent 27 probes at
the running production image and ran the load and soak script against it: 9 findings, 8
repaired, 1 declined. **No repro, no finding** — a finding that cannot be shown failing is an
opinion, and a reviewer always reports something.

The agent's own mistakes were caught the same way. It reported that Vite's `/ws` proxy broke on
a server restart; `lsof -ti:3000` had been matching Vite too, so it was killing the proxy
itself. Its first memory sampler called `docker stats --no-stream`, which takes two seconds a
call, so samples labelled ten minutes apart covered seventy seconds. Both were re-measured
before any number reached a document.

## Where AI was not used

The product decisions, and every merge. The end-to-end verification in a browser — two windows,
a room created in one and a message posted from the other, then a reload — is done by hand,
because it is the check a reviewer will actually repeat. The decision on each finding, always.
And nothing claims a screen-reader pass: the agent said plainly that it cannot hear VoiceOver,
so the accessibility work was verified with the keyboard and the accessibility tree, and
`docs/architecture.md` names the screen-reader pass as future work rather than as done.

## With another day

Find the real breaking point: the load run stopped at 8,000 sockets and 1,860 messages a second
because a single Node generator ran out, not because the server did, so the honest number today
is a floor. Add Playwright over the fresh-clone path that is checked by hand. Run the
screen-reader pass. None of these is a gap in what ships; they are the next three things worth
measuring.
