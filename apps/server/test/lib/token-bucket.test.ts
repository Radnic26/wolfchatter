import { describe, expect, it } from "vitest";
import { createTokenBucket } from "../../src/lib/token-bucket.ts";

const limit = { capacity: 3, refillPerSecond: 1 };

describe("createTokenBucket", () => {
  it("hands out its whole capacity before it refuses anything", () => {
    const bucket = createTokenBucket(limit, 0);

    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("gives an allowance back at the rate it promises", () => {
    const bucket = createTokenBucket(limit, 0);
    for (let spent = 0; spent < 3; spent += 1) bucket.take(0);

    expect(bucket.take(500)).toBe(false);
    expect(bucket.take(1000)).toBe(true);
  });

  it("never refills past its capacity, so an idle hour buys no burst", () => {
    const bucket = createTokenBucket(limit, 0);

    expect([bucket.take(3_600_000), bucket.take(3_600_000), bucket.take(3_600_000)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(bucket.take(3_600_000)).toBe(false);
  });

  it("counts as full only once the whole allowance is back", () => {
    const bucket = createTokenBucket(limit, 0);
    bucket.take(0);

    expect(bucket.isFull(500)).toBe(false);
    expect(bucket.isFull(1000)).toBe(true);
  });
});
