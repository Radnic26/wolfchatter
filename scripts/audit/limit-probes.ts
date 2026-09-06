import { randomUUID } from "node:crypto";
import { held, missed, type Probe } from "./probe.ts";

/**
 * The one probe that spends a shared allowance rather than its own, so it runs last: every
 * probe before it would otherwise meet a bucket this one had already emptied. It deliberately
 * speaks as a single caller even when the stack under test trusts a forwarding header,
 * because one caller is exactly what the control is there to bound.
 */
export function limitProbes(): Probe[] {
  return [
    {
      name: "write-rate-limit",
      control: "per-IP rate limit",
      expectation: "a burst from one caller is refused with 429, and the refusal names nobody",
      run: async (target) => {
        const caller = "10.0.99.99";
        const headers = {
          "content-type": "application/json",
          origin: target.origin,
          ...(target.clientHeader === undefined ? {} : { [target.clientHeader]: caller }),
        };

        const statuses: number[] = [];
        let refusalBody = "";
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const response = await fetch(`${target.baseUrl}/api/rooms`, {
            method: "POST",
            headers,
            body: JSON.stringify({ id: randomUUID(), lat: 1, lng: 2 }),
          });
          statuses.push(response.status);
          if (response.status === 429 && refusalBody === "") refusalBody = await response.text();
          else await response.body?.cancel();
          if (response.status === 429) break;
        }

        const refusedAt = statuses.indexOf(429);
        if (refusedAt === -1)
          return missed(`60 writes from one caller, none refused: ${statuses.length} accepted`);

        const namesTheCaller = refusalBody.includes(caller);
        const observed = `refused at write ${refusedAt + 1} with 429; body ${refusalBody}`;
        return namesTheCaller ? missed(`${observed} — which names the caller`) : held(observed);
      },
    },
  ];
}
