import { describe, expect, it } from "vitest";
import {
  isSupportedNodeVersion,
  parsePortAnswer,
  parseRunModeAnswer,
  shouldAskQuestions,
} from "../answers.ts";
import { offeredRunModes } from "../run-mode.ts";

describe("shouldAskQuestions", () => {
  it("asks when a person is at a terminal", () => {
    expect(shouldAskQuestions(false, {}, true)).toBe(true);
  });

  it("takes the defaults when stdin is piped", () => {
    expect(shouldAskQuestions(false, {}, false)).toBe(false);
  });

  it("takes the defaults when the flags asked for them", () => {
    expect(shouldAskQuestions(true, {}, true)).toBe(false);
  });

  it("takes the defaults under CI", () => {
    expect(shouldAskQuestions(false, { CI: "true" }, true)).toBe(false);
    expect(shouldAskQuestions(false, { CI: "1" }, true)).toBe(false);
  });

  it("still asks when CI is set to false or empty", () => {
    expect(shouldAskQuestions(false, { CI: "false" }, true)).toBe(true);
    expect(shouldAskQuestions(false, { CI: "" }, true)).toBe(true);
  });
});

describe("parseRunModeAnswer", () => {
  const offered = offeredRunModes(true);

  it("reads the listed position, not the mode name", () => {
    expect(parseRunModeAnswer("1", offered)).toBe("docker");
    expect(parseRunModeAnswer("3", offered)).toBe("embedded");
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseRunModeAnswer("  2  ", offered)).toBe("docker-database");
  });

  it("rejects a position nobody offered", () => {
    expect(parseRunModeAnswer("4", offered)).toBeUndefined();
    expect(parseRunModeAnswer("0", offered)).toBeUndefined();
  });

  it("rejects anything that is not a number", () => {
    expect(parseRunModeAnswer("docker", offered)).toBeUndefined();
    expect(parseRunModeAnswer("", offered)).toBeUndefined();
  });

  it("only offers the embedded option when Docker is missing", () => {
    expect(parseRunModeAnswer("1", offeredRunModes(false))).toBe("embedded");
    expect(parseRunModeAnswer("2", offeredRunModes(false))).toBeUndefined();
  });
});

describe("parsePortAnswer", () => {
  it("accepts a port in range", () => {
    expect(parsePortAnswer("8080")).toBe(8080);
    expect(parsePortAnswer(" 1 ")).toBe(1);
    expect(parsePortAnswer("65535")).toBe(65535);
  });

  it("rejects a port outside the range", () => {
    expect(parsePortAnswer("0")).toBeUndefined();
    expect(parsePortAnswer("65536")).toBeUndefined();
  });

  it("rejects anything that is not digits", () => {
    expect(parsePortAnswer("80 80")).toBeUndefined();
    expect(parsePortAnswer("-1")).toBeUndefined();
    expect(parsePortAnswer("3000x")).toBeUndefined();
    expect(parsePortAnswer("")).toBeUndefined();
  });
});

describe("isSupportedNodeVersion", () => {
  it("accepts every line that can strip the types, odd releases included", () => {
    expect(isSupportedNodeVersion("v22.18.0")).toBe(true);
    expect(isSupportedNodeVersion("v22.23.2")).toBe(true);
    expect(isSupportedNodeVersion("v24.20.0")).toBe(true);
    expect(isSupportedNodeVersion("v25.9.0")).toBe(true);
    expect(isSupportedNodeVersion("v26.0.0")).toBe(true);
  });

  it("rejects anything older, where a .ts entry point cannot be loaded at all", () => {
    expect(isSupportedNodeVersion("v22.17.0")).toBe(false);
    expect(isSupportedNodeVersion("v20.20.2")).toBe(false);
    expect(isSupportedNodeVersion("v18.20.8")).toBe(false);
  });

  it("rejects a version it cannot read", () => {
    expect(isSupportedNodeVersion("unknown")).toBe(false);
  });
});
