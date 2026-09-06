/**
 * The latency summary the audit reports, from the samples it collected. Pure, so the load
 * run's arithmetic can be reasoned about without a server in the room.
 */
export interface LatencySummary {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Nearest-rank, which needs no interpolation and never invents a value nobody measured. */
export function percentile(sortedSamples: readonly number[], fraction: number): number {
  if (sortedSamples.length === 0) return Number.NaN;
  const rank = Math.ceil(fraction * sortedSamples.length);
  return sortedSamples[Math.min(Math.max(rank, 1), sortedSamples.length) - 1] ?? Number.NaN;
}

export function summarise(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? Number.NaN,
  };
}
