import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import {
  countEntry,
  emptyTally,
  type Summary,
  summarise,
  type Tally,
  type TranscriptEntry,
} from "./aggregate.ts";

const usage = `Usage: node scripts/ai/collaboration-stats.ts <transcript.jsonl>... [--json]

Reports how the work on this repository was divided between its author and Claude Code,
from the session transcripts themselves. Every number in docs/ai/working-with-ai.md comes
from here, so it can be re-run and disagreed with.

Claude Code writes one JSONL file per session under
~/.claude/projects/<start-directory>/, grouped by the directory the session started in
rather than by project, so the files are given as arguments instead of discovered. The
list this repository used is in wolfchatter-prep/sessions/transcripts.md.

Transcripts are megabytes and hold the conversation itself, so they are streamed line by
line and only aggregates ever leave this process.

  --json   print the summary as JSON instead of a table
  --help   print this
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

async function tallyFile(path: string): Promise<Tally> {
  const tally = emptyTally(basename(path, ".jsonl"));
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });

  for await (const line of lines) {
    if (line.trim() === "") continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line) as TranscriptEntry;
    } catch {
      // A session still being written can end mid-line; every earlier line still counts.
      continue;
    }
    countEntry(tally, entry);
  }

  return tally;
}

function hoursBetween(from: string | undefined, to: string | undefined): string {
  if (from === undefined || to === undefined) return "—";
  const minutes = (Date.parse(to) - Date.parse(from)) / 60_000;
  return minutes < 60 ? `${Math.round(minutes)}m` : `${(minutes / 60).toFixed(1)}h`;
}

function shortTime(timestamp: string | undefined): string {
  return timestamp === undefined ? "—" : timestamp.slice(0, 16).replace("T", " ");
}

function byCount(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}

function printTable(summary: Summary): void {
  console.log("Sessions, oldest first\n");
  console.log("  started           ended              span  instructions  steps  models");
  for (const session of summary.sessions) {
    const models = Object.keys(session.models).join(", ") || "—";
    console.log(
      `  ${shortTime(session.firstTimestamp)}  ${shortTime(session.lastTimestamp)}  ` +
        `${hoursBetween(session.firstTimestamp, session.lastTimestamp).padStart(5)}  ` +
        `${String(session.instructions).padStart(12)}  ${String(session.steps).padStart(5)}  ${models}`,
    );
  }

  console.log(`\nSpan: ${summary.days.length} days, ${summary.days[0]} to ${summary.days.at(-1)}`);
  console.log(`Sessions: ${summary.sessions.length}`);
  console.log(`Instructions from the author: ${summary.instructions}`);
  console.log(`Agent steps: ${summary.steps}`);
  console.log(`Steps per instruction: ${summary.stepsPerInstruction.toFixed(1)}`);
  console.log(
    `Subagents launched: ${summary.agentsLaunched} directly, ${summary.workflowsRun} workflows ` +
      `(each keeps its own transcript, so their turns are not counted above)`,
  );

  console.log("\nModels, by turns taken");
  for (const [model, turns] of byCount(summary.models)) console.log(`  ${model}: ${turns}`);

  console.log("\nTool calls, by category");
  for (const [category, calls] of byCount(summary.tools)) console.log(`  ${category}: ${calls}`);

  const models = Object.entries(summary.tokens);
  console.log("\nTokens, by model");
  if (models.length === 0) console.log("  no usage recorded in these transcripts");
  for (const [model, totals] of models) {
    console.log(
      `  ${model}: ${totals.input} in, ${totals.output} out, ` +
        `${totals.cacheWrite} cache written, ${totals.cacheRead} cache read`,
    );
  }
}

const summary = summarise(await Promise.all(positionals.map(tallyFile)));

if (values.json) console.log(JSON.stringify(summary, null, 2));
else printTable(summary);
