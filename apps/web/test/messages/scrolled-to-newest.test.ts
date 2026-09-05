import { describe, expect, it } from "vitest";
import { isShowingNewest } from "../../src/messages/scrolled-to-newest.ts";

describe("isShowingNewest", () => {
  it("says yes when the list is scrolled all the way down", () => {
    expect(isShowingNewest({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it("says yes when the list is too short to scroll at all", () => {
    expect(isShowingNewest({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBe(true);
  });

  it("forgives the last line, so a stopped scroll still counts as reading the end", () => {
    expect(isShowingNewest({ scrollTop: 770, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it("says no once the reader has gone further up than that", () => {
    expect(isShowingNewest({ scrollTop: 760, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });

  it("says no when the reader is at the top of a long history", () => {
    expect(isShowingNewest({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });
});
