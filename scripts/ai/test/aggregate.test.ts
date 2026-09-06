import { describe, expect, it } from "vitest";
import { categoryOf, countEntry, emptyTally, summarise, type TranscriptEntry } from "../aggregate.ts";

function fold(entries: readonly TranscriptEntry[], session = "one") {
  return entries.reduce(countEntry, emptyTally(session));
}

function instruction(text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return { type: "user", message: { role: "user", content: [{ type: "text", text }] }, ...extra };
}

function step(model: string, content: unknown[] = [{ type: "text" }]): TranscriptEntry {
  return { type: "assistant", message: { role: "assistant", model, content } };
}

function toolCall(name: string): TranscriptEntry {
  return step("claude-opus-5", [{ type: "tool_use", name }]);
}

describe("counting one transcript", () => {
  it("counts a message the author typed as an instruction", () => {
    expect(fold([instruction("write the README")]).instructions).toBe(1);
  });

  it("does not count a tool result, which wears the same role", () => {
    const toolResult: TranscriptEntry = {
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", content: "ok" }] },
    };

    expect(fold([toolResult]).instructions).toBe(0);
  });

  it("does not count the harness's own injected messages", () => {
    expect(fold([instruction("a reminder", { isMeta: true })]).instructions).toBe(0);
  });

  it("does not count a prompt handed to a subagent as one the author gave", () => {
    expect(fold([instruction("go and look", { isSidechain: true })]).instructions).toBe(0);
  });

  it("records every model that took a turn", () => {
    const tally = fold([step("claude-fable-5-1"), step("claude-opus-5"), step("claude-opus-5")]);

    expect(tally.models).toEqual({ "claude-fable-5-1": 1, "claude-opus-5": 2 });
  });

  it("does not credit a turn to the harness's own synthetic sender", () => {
    const tally = fold([step("<synthetic>")]);

    expect(tally.steps).toBe(1);
    expect(tally.models).toEqual({});
  });

  it("counts a turn whose sender was not recorded at all", () => {
    const nameless: TranscriptEntry = { type: "assistant", message: { role: "assistant" } };

    expect(fold([nameless]).steps).toBe(1);
  });

  it("keeps the first and the last timestamp it saw", () => {
    const tally = fold([
      { ...step("claude-opus-5"), timestamp: "2026-09-05T10:00:00.000Z" },
      { ...step("claude-opus-5"), timestamp: "2026-09-05T12:00:00.000Z" },
    ]);

    expect(tally.firstTimestamp).toBe("2026-09-05T10:00:00.000Z");
    expect(tally.lastTimestamp).toBe("2026-09-05T12:00:00.000Z");
  });

  it("groups tool calls by what they do rather than by name", () => {
    const tally = fold([toolCall("Read"), toolCall("Grep"), toolCall("Edit"), toolCall("Bash")]);

    expect(tally.tools).toEqual({ reading: 2, writing: 1, shell: 1 });
  });

  it("counts a launched subagent and a workflow apart, because only one fans out", () => {
    const tally = fold([toolCall("Agent"), toolCall("Task"), toolCall("Workflow"), toolCall("Read")]);

    expect(tally.agentsLaunched).toBe(2);
    expect(tally.workflowsRun).toBe(1);
  });

  it("adds up token usage per model when the transcript records it", () => {
    const withUsage: TranscriptEntry = {
      type: "assistant",
      message: {
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "text" }],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
      },
    };

    expect(fold([withUsage, withUsage]).tokens["claude-opus-5"]).toEqual({
      input: 20,
      output: 10,
      cacheWrite: 0,
      cacheRead: 200,
    });
  });

  it("leaves the token totals empty when no usage was recorded", () => {
    expect(fold([step("claude-opus-5")]).tokens).toEqual({});
  });

  it("ignores an entry whose content is not a list of blocks", () => {
    const plain: TranscriptEntry = { type: "user", message: { role: "user", content: "hello" } };

    expect(fold([plain]).instructions).toBe(0);
  });
});

describe("categoryOf", () => {
  it.each([
    ["Read", "reading"],
    ["Write", "writing"],
    ["Bash", "shell"],
    ["WebSearch", "web"],
    ["Task", "subagents"],
  ])("puts %s under %s", (tool, category) => {
    expect(categoryOf(tool)).toBe(category);
  });

  it("keeps a tool it does not know rather than dropping it", () => {
    expect(categoryOf("SomeFutureTool")).toBe("other");
  });
});

describe("summarising several transcripts", () => {
  const morning = fold(
    [
      { ...instruction("one"), timestamp: "2026-09-05T09:00:00.000Z" },
      { ...step("claude-opus-5"), timestamp: "2026-09-05T09:30:00.000Z" },
      toolCall("Read"),
    ],
    "morning",
  );
  const evening = fold(
    [
      { ...instruction("two"), timestamp: "2026-09-06T20:00:00.000Z" },
      { ...instruction("three"), timestamp: "2026-09-06T20:10:00.000Z" },
      { ...step("claude-fable-5-1"), timestamp: "2026-09-06T21:00:00.000Z" },
      toolCall("Task"),
    ],
    "evening",
  );

  it("orders sessions by when they started, which is the order the work happened in", () => {
    expect(summarise([evening, morning]).sessions.map((s) => s.session)).toEqual(["morning", "evening"]);
  });

  it("counts the distinct days worked rather than the sessions", () => {
    expect(summarise([morning, evening]).days).toEqual(["2026-09-05", "2026-09-06"]);
  });

  it("adds instructions and steps across every session", () => {
    const summary = summarise([morning, evening]);

    expect(summary.instructions).toBe(3);
    expect(summary.steps).toBe(4);
  });

  it("reports how many steps one instruction bought", () => {
    expect(summarise([morning, evening]).stepsPerInstruction).toBeCloseTo(4 / 3);
  });

  it("says nothing rather than dividing by zero when no instruction was given", () => {
    expect(summarise([fold([step("claude-opus-5")])]).stepsPerInstruction).toBe(0);
  });

  it("merges the models, the tool categories and the subagent count", () => {
    const summary = summarise([morning, evening]);

    expect(summary.models).toEqual({ "claude-opus-5": 3, "claude-fable-5-1": 1 });
    expect(summary.tools).toEqual({ reading: 1, subagents: 1 });
    expect(summary.agentsLaunched).toBe(1);
    expect(summary.workflowsRun).toBe(0);
  });

  it("merges token totals for a model that ran in more than one session", () => {
    const usage = { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3 };
    const withUsage = (): TranscriptEntry => ({
      type: "assistant",
      message: { role: "assistant", model: "claude-opus-5", content: [], usage },
    });

    const summary = summarise([fold([withUsage()], "a"), fold([withUsage()], "b")]);

    expect(summary.tokens["claude-opus-5"]).toEqual({
      input: 2,
      output: 4,
      cacheWrite: 6,
      cacheRead: 0,
    });
  });
});
