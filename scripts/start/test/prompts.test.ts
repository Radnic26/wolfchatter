import { describe, expect, it } from "vitest";
import { renderDockerMissingNotice, renderReady, renderRunModeQuestion } from "../prompts.ts";
import { offeredRunModes } from "../run-mode.ts";

describe("renderRunModeQuestion", () => {
  it("numbers the options from one, so the answer is the position typed", () => {
    const question = renderRunModeQuestion(offeredRunModes(true));

    expect(question).toContain("1) Everything in Docker");
    expect(question).toContain("2) App here, PostgreSQL in Docker");
    expect(question).toContain("3) Everything here, embedded database");
  });

  it("lists only what was offered", () => {
    const question = renderRunModeQuestion(offeredRunModes(false));

    expect(question).toContain("1) Everything here, embedded database");
    expect(question).not.toContain("2)");
  });
});

describe("renderDockerMissingNotice", () => {
  it("says why the other options are absent and how to get them back", () => {
    expect(renderDockerMissingNotice()).toMatch(/Docker is not running/);
    expect(renderDockerMissingNotice()).toMatch(/Start Docker/);
  });
});

describe("renderReady", () => {
  it("prints the url and promises reload when the dev servers are running", () => {
    expect(renderReady("http://localhost:5173", true)).toContain("http://localhost:5173");
    expect(renderReady("http://localhost:5173", true)).toContain("reload automatically");
  });

  it("warns that the production image does not pick up edits", () => {
    expect(renderReady("http://localhost:3000", false)).toContain("need a rebuild");
  });
});
