import { describe, expect, it } from "vitest";
import { onlyRow } from "../../src/lib/only-row.ts";

describe("onlyRow", () => {
  it("returns the single row a statement promised", () => {
    expect(onlyRow([{ id: 1 }])).toEqual({ id: 1 });
  });

  it("fails loudly when the statement returned nothing", () => {
    expect(() => onlyRow([])).toThrow(/no row where exactly one was expected/);
  });
});
