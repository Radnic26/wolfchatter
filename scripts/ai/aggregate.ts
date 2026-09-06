/**
 * The aggregation half of `collaboration-stats.ts`, kept pure so it can be tested without
 * a transcript on disk. Nothing here reads a file or prints; it folds one parsed JSONL
 * entry at a time into a tally, because the transcripts are megabytes and are streamed.
 */

export interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: Record<string, unknown>;
  };
}

export interface Tally {
  session: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  /** Messages typed by the author, as opposed to tool results wearing the same role. */
  instructions: number;
  /** Assistant turns recorded in the transcript. */
  steps: number;
  models: Record<string, number>;
  tools: Record<string, number>;
  /**
   * Launches, not turns. A subagent keeps its own transcript, and a workflow's fan-out is
   * not written here at all, so this counts the calls that started them and stops there.
   */
  agentsLaunched: number;
  workflowsRun: number;
  tokens: Record<string, TokenTotals>;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * The five categories are what the document reports, because a raw list of thirty tool
 * names says less about how the work was divided than "read this much, wrote that much".
 */
const toolCategories: Record<string, readonly string[]> = {
  reading: ["Read", "Glob", "Grep", "NotebookRead", "ListAgents", "TodoRead"],
  writing: ["Write", "Edit", "MultiEdit", "NotebookEdit", "TodoWrite"],
  shell: ["Bash", "BashOutput", "KillShell", "KillBash"],
  web: ["WebFetch", "WebSearch"],
  subagents: ["Task", "Agent", "Workflow", "SendMessage"],
};

const launchesAnAgent = new Set(["Task", "Agent"]);

/**
 * The name the harness records when it writes a message on nobody's behalf — an interrupt,
 * an error — which is not a model that took a turn.
 */
const syntheticModel = "<synthetic>";

export function categoryOf(toolName: string): string {
  for (const [category, names] of Object.entries(toolCategories)) {
    if (names.includes(toolName)) return category;
  }
  return "other";
}

export function emptyTally(session: string): Tally {
  return {
    session,
    instructions: 0,
    steps: 0,
    models: {},
    tools: {},
    agentsLaunched: 0,
    workflowsRun: 0,
    tokens: {},
  };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function blocksOf(entry: TranscriptEntry): Record<string, unknown>[] {
  const content = entry.message?.content;
  return Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
}

/** An author's message carries a text block; a tool result carries the same role and does not. */
function isInstruction(entry: TranscriptEntry): boolean {
  if (entry.type !== "user" || entry.isMeta === true || entry.isSidechain === true) return false;
  return blocksOf(entry).some((block) => block.type === "text");
}

function totalsFor(tokens: Record<string, TokenTotals>, model: string): TokenTotals {
  const existing = tokens[model];
  if (existing !== undefined) return existing;

  const created: TokenTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  tokens[model] = created;
  return created;
}

function addTokenTotals(into: TokenTotals, from: TokenTotals): void {
  into.input += from.input;
  into.output += from.output;
  into.cacheWrite += from.cacheWrite;
  into.cacheRead += from.cacheRead;
}

function addTokens(tally: Tally, model: string, usage: Record<string, unknown>): void {
  const read = (key: string): number => (typeof usage[key] === "number" ? usage[key] : 0);
  addTokenTotals(totalsFor(tally.tokens, model), {
    input: read("input_tokens"),
    output: read("output_tokens"),
    cacheWrite: read("cache_creation_input_tokens"),
    cacheRead: read("cache_read_input_tokens"),
  });
}

export function countEntry(tally: Tally, entry: TranscriptEntry): Tally {
  if (entry.timestamp !== undefined) {
    tally.firstTimestamp ??= entry.timestamp;
    tally.lastTimestamp = entry.timestamp;
  }

  if (isInstruction(entry)) tally.instructions += 1;

  if (entry.type === "assistant") {
    tally.steps += 1;

    const model = entry.message?.model;
    if (model !== undefined && model !== syntheticModel) {
      increment(tally.models, model);
      if (entry.message?.usage) addTokens(tally, model, entry.message.usage);
    }
  }

  for (const block of blocksOf(entry)) {
    if (block.type !== "tool_use" || typeof block.name !== "string") continue;
    increment(tally.tools, categoryOf(block.name));
    if (launchesAnAgent.has(block.name)) tally.agentsLaunched += 1;
    if (block.name === "Workflow") tally.workflowsRun += 1;
  }

  return tally;
}

export interface Summary {
  sessions: Tally[];
  days: string[];
  instructions: number;
  steps: number;
  stepsPerInstruction: number;
  models: Record<string, number>;
  tools: Record<string, number>;
  agentsLaunched: number;
  workflowsRun: number;
  tokens: Record<string, TokenTotals>;
}

function mergeCounts(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}

/** Sessions are reported oldest first, which is the order the work happened in. */
export function summarise(tallies: readonly Tally[]): Summary {
  const sessions = [...tallies].sort((a, b) =>
    (a.firstTimestamp ?? "").localeCompare(b.firstTimestamp ?? ""),
  );

  const summary: Summary = {
    sessions,
    days: [],
    instructions: 0,
    steps: 0,
    stepsPerInstruction: 0,
    models: {},
    tools: {},
    agentsLaunched: 0,
    workflowsRun: 0,
    tokens: {},
  };

  const days = new Set<string>();
  for (const tally of sessions) {
    if (tally.firstTimestamp) days.add(tally.firstTimestamp.slice(0, 10));
    summary.instructions += tally.instructions;
    summary.steps += tally.steps;
    summary.agentsLaunched += tally.agentsLaunched;
    summary.workflowsRun += tally.workflowsRun;
    mergeCounts(summary.models, tally.models);
    mergeCounts(summary.tools, tally.tools);
    for (const [model, totals] of Object.entries(tally.tokens)) {
      addTokenTotals(totalsFor(summary.tokens, model), totals);
    }
  }

  summary.days = [...days].sort();
  summary.stepsPerInstruction = summary.instructions === 0 ? 0 : summary.steps / summary.instructions;
  return summary;
}
