import { describe, expect, it } from "vitest";
import { parseFlags } from "../flags.ts";

describe("parseFlags", () => {
  it("starts the wizard when nothing was asked for", () => {
    expect(parseFlags([])).toEqual({
      printsUsage: false,
      carriesAnUnknownFlag: false,
      takesDefaults: false,
      rewritesEnvFile: false,
    });
  });

  it("takes every default on --yes and on its short form", () => {
    expect(parseFlags(["--yes"]).takesDefaults).toBe(true);
    expect(parseFlags(["-y"]).takesDefaults).toBe(true);
  });

  it("prints the usage instead of starting anything on --help", () => {
    expect(parseFlags(["--help"]).printsUsage).toBe(true);
  });

  it("writes the env file again on --reconfigure", () => {
    expect(parseFlags(["--reconfigure"]).rewritesEnvFile).toBe(true);
  });

  it("reads the flags in any order and in any combination", () => {
    expect(parseFlags(["--reconfigure", "-y"])).toEqual({
      printsUsage: false,
      carriesAnUnknownFlag: false,
      takesDefaults: true,
      rewritesEnvFile: true,
    });
  });

  it("answers a flag nobody offers with the usage rather than a Docker build", () => {
    expect(parseFlags(["--rekonfigure"]).printsUsage).toBe(true);
    expect(parseFlags(["--rekonfigure"]).rewritesEnvFile).toBe(false);
  });

  it("marks a flag nobody offers as unknown, so asking for help is not confused with a typo", () => {
    expect(parseFlags(["--rekonfigure"]).carriesAnUnknownFlag).toBe(true);
    expect(parseFlags(["--help"]).carriesAnUnknownFlag).toBe(false);
  });
});
