/**
 * A probe is one input class from NFR-2 and the answer the application owes it. It returns
 * the evidence either way, because a control that holds has to be as quotable as one that
 * does not: the report says "held, with this output", not "we looked".
 */
export interface ProbeResult {
  /** What the application actually did, quoted in the report next to the verdict. */
  observed: string;
  held: boolean;
}

export interface Probe {
  name: string;
  /** The NFR-2 control this answers, worded as the PRD words it. */
  control: string;
  expectation: string;
  run(target: Target): Promise<ProbeResult>;
}

export interface Target {
  baseUrl: string;
  origin: string;
  /**
   * Set only for the probes that are not about the write limiter: it lets one process
   * spend allowance as many callers, the way many callers behind a proxy would. The
   * limiter's own probe leaves it undefined, which is how the image ships.
   */
  clientHeader?: string;
}

export function held(observed: string): ProbeResult {
  return { observed, held: true };
}

export function missed(observed: string): ProbeResult {
  return { observed, held: false };
}

/** One caller per call, so a probe that is not testing the limiter never meets it. */
export function callerHeaders(target: Target, caller: string): Record<string, string> {
  return target.clientHeader === undefined ? {} : { [target.clientHeader]: caller };
}

export async function readBody(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
