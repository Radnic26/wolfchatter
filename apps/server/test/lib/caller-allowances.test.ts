import { describe, expect, it } from "vitest";
import { createCallerAllowances } from "../../src/lib/caller-allowances.ts";

const options = { limit: { capacity: 2, refillPerSecond: 1 }, forgetAbove: 3 };

describe("createCallerAllowances", () => {
  it("gives every caller its own allowance, so one cannot spend another's", () => {
    const allowances = createCallerAllowances(options);

    allowances.forCaller("first", 0).take(0);
    allowances.forCaller("first", 0).take(0);

    expect(allowances.forCaller("first", 0).take(0)).toBe(false);
    expect(allowances.forCaller("second", 0).take(0)).toBe(true);
  });

  it("keeps a caller's allowance across requests rather than starting it over", () => {
    const allowances = createCallerAllowances(options);

    allowances.forCaller("someone", 0).take(0);
    allowances.forCaller("someone", 0).take(0);

    expect(allowances.forCaller("someone", 0).take(0)).toBe(false);
  });

  it("forgets the callers that are back at a full allowance, so the store stays bounded", () => {
    const allowances = createCallerAllowances(options);
    for (const caller of ["first", "second", "third"]) allowances.forCaller(caller, 0).take(0);

    allowances.forCaller("fourth", 10_000);

    expect(allowances.size).toBe(1);
  });

  it("keeps the callers that are still spending, which are the ones the limit is for", () => {
    const allowances = createCallerAllowances(options);
    for (const caller of ["first", "second", "third"]) {
      allowances.forCaller(caller, 0).take(0);
      allowances.forCaller(caller, 0).take(0);
    }

    allowances.forCaller("fourth", 500);

    expect(allowances.size).toBe(4);
  });
});
