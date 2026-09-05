import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { clientAddress } from "../../src/lib/client-address.ts";

/** What the Node adapter puts on the context: the request, and the socket it arrived on. */
function requestFrom(remoteAddress: string | undefined): Context {
  return {
    env: { incoming: { socket: { remoteAddress, remotePort: 51_234, remoteFamily: "IPv4" } } },
  } as unknown as Context;
}

describe("clientAddress", () => {
  it("names the peer the socket says the request came from", () => {
    expect(clientAddress(requestFrom("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("falls back to one shared caller when the socket can no longer name it", () => {
    // A socket that has already gone reports nothing. Grouping those together limits them
    // as a whole, which is safer than letting each one through as a caller of its own.
    expect(clientAddress(requestFrom(undefined))).toBe("");
  });
});
