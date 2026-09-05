/** How much a caller may spend at once, and how fast the allowance comes back. */
export interface RateLimit {
  capacity: number;
  refillPerSecond: number;
}

export interface TokenBucket {
  /** True when the request fits in what is left, and then it costs a token. */
  take(at: number): boolean;
  /** A bucket back at capacity remembers nothing, so it can be forgotten. */
  isFull(at: number): boolean;
}

/**
 * The allowance behind every limit in the app: per IP on the write endpoints, per connection
 * on the socket. The clock is passed in and has to be monotonic — `performance.now()`, not
 * `Date.now()`, which a time correction can move backwards and hand out free tokens.
 */
export function createTokenBucket(limit: RateLimit, startedAt: number): TokenBucket {
  let tokens = limit.capacity;
  let refilledAt = startedAt;

  function refill(at: number): void {
    tokens = Math.min(limit.capacity, tokens + ((at - refilledAt) / 1000) * limit.refillPerSecond);
    refilledAt = at;
  }

  return {
    take(at) {
      refill(at);
      if (tokens < 1) return false;

      tokens -= 1;
      return true;
    },

    isFull(at) {
      refill(at);
      return tokens >= limit.capacity;
    },
  };
}
