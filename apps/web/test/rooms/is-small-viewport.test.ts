import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmallViewport } from "../../src/rooms/is-small-viewport.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSmallViewport", () => {
  it("is the layout below FR-10's breakpoint", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(width < 48rem)" }));

    expect(isSmallViewport()).toBe(true);
  });

  it("is not the wide layout", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));

    expect(isSmallViewport()).toBe(false);
  });

  it("answers for the one layout a browser without matchMedia has", () => {
    expect(isSmallViewport()).toBe(false);
  });
});
