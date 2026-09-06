import { randomUUID } from "node:crypto";

export interface WriterOptions {
  baseUrl: string;
  origin: string;
  roomIds: readonly string[];
  messagesPerSecond: number;
  seconds: number;
  /**
   * The header the stack under test trusts. NFR-3's ten times is five hundred people, not
   * one, and the per-IP allowance is deliberately smaller than that — so a run that speaks
   * as one caller measures the rate limiter instead of the fan-out. Undefined means the run
   * accepts that and says so in the report.
   */
  clientHeader: string | undefined;
  onPosted(messageId: string, postedAt: number): void;
}

export interface WriteOutcome {
  attempted: number;
  accepted: number;
  /** Status code to how many answers carried it, for every answer that was not a 201. */
  refusals: Record<number, number>;
  failures: number;
}

const body = "The quick brown fox jumps over the lazy dog, and then says something about it.";

/**
 * The write half of the load: a fixed rate, held by scheduling each tick against the clock
 * rather than by sleeping between requests, so a slow answer delays that request and not
 * the rate. Every message is posted as a different caller, which is what many people are.
 */
export async function writeMessages(options: WriterOptions): Promise<WriteOutcome> {
  const outcome: WriteOutcome = { attempted: 0, accepted: 0, refusals: {}, failures: 0 };
  const total = options.messagesPerSecond * options.seconds;
  const interval = 1000 / options.messagesPerSecond;
  const startedAt = performance.now();
  const inFlight: Promise<void>[] = [];

  for (let index = 0; index < total; index += 1) {
    const dueAt = startedAt + index * interval;
    const wait = dueAt - performance.now();
    if (wait > 0) await new Promise((resume) => setTimeout(resume, wait));

    const messageId = randomUUID();
    const roomId = options.roomIds[index % options.roomIds.length];
    const caller = `10.${Math.floor(index / 65_536) % 256}.${Math.floor(index / 256) % 256}.${index % 256}`;
    outcome.attempted += 1;

    inFlight.push(
      (async () => {
        const postedAt = performance.now();
        options.onPosted(messageId, postedAt);
        try {
          const response = await fetch(`${options.baseUrl}/api/rooms/${roomId}/messages`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: options.origin,
              ...(options.clientHeader === undefined ? {} : { [options.clientHeader]: caller }),
            },
            body: JSON.stringify({ id: messageId, username: "load", body }),
          });
          await response.body?.cancel();
          if (response.status === 201) outcome.accepted += 1;
          else outcome.refusals[response.status] = (outcome.refusals[response.status] ?? 0) + 1;
        } catch {
          outcome.failures += 1;
        }
      })(),
    );
  }

  await Promise.all(inFlight);
  return outcome;
}
