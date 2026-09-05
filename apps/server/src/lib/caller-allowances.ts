import { createTokenBucket, type RateLimit, type TokenBucket } from "./token-bucket.ts";

export interface CallerAllowancesOptions {
  limit: RateLimit;
  /**
   * Past this many callers the store is swept of everyone back at a full allowance: they are
   * indistinguishable from a caller never seen before. Without it a long-running process
   * remembers every address that ever wrote to it.
   */
  forgetAbove: number;
}

export interface CallerAllowances {
  forCaller(address: string, at: number): TokenBucket;
  /** What the sweep bounds, and the only reason this store is a thing of its own. */
  readonly size: number;
}

export function createCallerAllowances({ limit, forgetAbove }: CallerAllowancesOptions): CallerAllowances {
  const held = new Map<string, TokenBucket>();

  return {
    get size() {
      return held.size;
    },

    forCaller(address, at) {
      const known = held.get(address);
      if (known) return known;

      if (held.size >= forgetAbove) {
        for (const [caller, allowance] of held) {
          if (allowance.isFull(at)) held.delete(caller);
        }
      }

      const fresh = createTokenBucket(limit, at);
      held.set(address, fresh);
      return fresh;
    },
  };
}
