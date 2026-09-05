import { describe, expect, it } from "vitest";
import {
  isSupportedNodeVersion,
  parsePortAnswer,
  parseRunModeAnswer,
  parseTileSourceAnswer,
  shouldAskQuestions,
} from "../answers.ts";
import { offeredRunModes } from "../run-mode.ts";
import { offeredTileSources } from "../tile-source.ts";

describe("shouldAskQuestions", () => {
  it("asks when a person is at a terminal", () => {
    expect(shouldAskQuestions([], {}, true)).toBe(true);
  });

  it("takes the defaults when stdin is piped", () => {
    expect(shouldAskQuestions([], {}, false)).toBe(false);
  });

  it("takes the defaults on --yes and on -y", () => {
    expect(shouldAskQuestions(["--yes"], {}, true)).toBe(false);
    expect(shouldAskQuestions(["-y"], {}, true)).toBe(false);
  });

  it("takes the defaults under CI", () => {
    expect(shouldAskQuestions([], { CI: "true" }, true)).toBe(false);
    expect(shouldAskQuestions([], { CI: "1" }, true)).toBe(false);
  });

  it("still asks when CI is set to false or empty", () => {
    expect(shouldAskQuestions([], { CI: "false" }, true)).toBe(true);
    expect(shouldAskQuestions([], { CI: "" }, true)).toBe(true);
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

describe("parseTileSourceAnswer", () => {
  it("reads the listed position, not the source name", () => {
    expect(parseTileSourceAnswer("1", offeredTileSources)).toBe("watercolor");
    expect(parseTileSourceAnswer("2", offeredTileSources)).toBe("osm");
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseTileSourceAnswer("  2  ", offeredTileSources)).toBe("osm");
  });

  it("rejects a position nobody offered", () => {
    expect(parseTileSourceAnswer("3", offeredTileSources)).toBeUndefined();
    expect(parseTileSourceAnswer("0", offeredTileSources)).toBeUndefined();
  });

  it("rejects anything that is not a number, so Enter keeps the default", () => {
    expect(parseTileSourceAnswer("osm", offeredTileSources)).toBeUndefined();
    expect(parseTileSourceAnswer("", offeredTileSources)).toBeUndefined();
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
  it("accepts the versions that have the APIs the server uses", () => {
    expect(isSupportedNodeVersion("v24.16.0")).toBe(true);
    expect(isSupportedNodeVersion("v24.20.0")).toBe(true);
    expect(isSupportedNodeVersion("v26.0.0")).toBe(true);
  });

  it("rejects anything older", () => {
    expect(isSupportedNodeVersion("v24.15.0")).toBe(false);
    expect(isSupportedNodeVersion("v22.20.0")).toBe(false);
  });

  it("rejects a version it cannot read", () => {
    expect(isSupportedNodeVersion("unknown")).toBe(false);
  });
});
