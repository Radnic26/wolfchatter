import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "../../src/lib/random-uuid.ts";

const version4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("randomUuid", () => {
  it("mints the version 4 uuid the API asks for", () => {
    expect(randomUuid()).toMatch(version4);
  });

  it("stamps the version and the variant however the random bytes fall", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });

    expect(randomUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("keeps every bit that is not the version or the variant", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0x00) });

    expect(randomUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("mints a different id every time, so two clicks are two rooms", () => {
    expect(new Set(Array.from({ length: 50 }, randomUuid)).size).toBe(50);
  });

  it("needs no secure context, which the dev server on a phone is not", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });

    expect(randomUuid()).toMatch(version4);
  });
});
