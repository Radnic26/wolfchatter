import type { Context, MiddlewareHandler } from "hono";
import { failWith } from "./api-error.ts";
import { createCallerAllowances } from "./caller-allowances.ts";
import type { RateLimit } from "./token-bucket.ts";

/**
 * Enough for someone typing fast, and for a few people sharing one office address, while
 * still costing an attacker a round trip per row. Writes go over HTTP, so this is the only
 * door into the database.
 */
const writeLimit: RateLimit = { capacity: 40, refillPerSecond: 2 };

const forgetCallersAbove = 10_000;

export interface RateLimitOptions {
  addressOf: (c: Context) => string;
  /** Monotonic: `Date.now()` can move backwards and hand out free allowance. */
  now: () => number;
}

export function limitWritesPerCaller({ addressOf, now }: RateLimitOptions): MiddlewareHandler {
  const allowances = createCallerAllowances({ limit: writeLimit, forgetAbove: forgetCallersAbove });

  return async (c, next) => {
    const at = now();
    const address = addressOf(c);
    if (!allowances.forCaller(address, at).take(at)) {
      return failWith(c, "rate_limited", 429, `too many writes from ${address}`);
    }

    await next();
  };
}
