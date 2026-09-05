import { describe, expect, it } from "vitest";
import { defaultRunMode, offeredRunModes, usesDockerDatabase } from "../run-mode.ts";

describe("offeredRunModes", () => {
  it("offers every mode when Docker is running", () => {
    expect(offeredRunModes(true).map((choice) => choice.mode)).toEqual([
      "docker",
      "docker-database",
      "embedded",
    ]);
  });

  it("offers only what works without Docker", () => {
    expect(offeredRunModes(false).map((choice) => choice.mode)).toEqual(["embedded"]);
  });

  it("gives every offered mode a label and a reason to pick it", () => {
    for (const choice of offeredRunModes(true)) {
      expect(choice.label).not.toBe("");
      expect(choice.detail).not.toBe("");
    }
  });
});

describe("defaultRunMode", () => {
  it("defaults to the production stack when Docker is available", () => {
    expect(defaultRunMode(true)).toBe("docker");
  });

  it("falls back to the mode that installs nothing", () => {
    expect(defaultRunMode(false)).toBe("embedded");
  });

  it("always defaults to something that was offered", () => {
    for (const hasDocker of [true, false]) {
      const offered = offeredRunModes(hasDocker).map((choice) => choice.mode);
      expect(offered).toContain(defaultRunMode(hasDocker));
    }
  });
});

describe("usesDockerDatabase", () => {
  it("is true for both Docker modes and false for the embedded one", () => {
    expect(usesDockerDatabase("docker")).toBe(true);
    expect(usesDockerDatabase("docker-database")).toBe(true);
    expect(usesDockerDatabase("embedded")).toBe(false);
  });
});
