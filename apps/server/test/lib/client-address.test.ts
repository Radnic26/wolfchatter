import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { clientAddress } from "../../src/lib/client-address.ts";

/** What the Node adapter puts on the context: the request, and the socket it arrived on. */
function requestFrom(remoteAddress: string | undefined, headers: Record<string, string> = {}): Context {
  return {
    env: { incoming: { socket: { remoteAddress, remotePort: 51_234, remoteFamily: "IPv4" } } },
    req: { header: (name: string) => headers[name] },
  } as unknown as Context;
}

describe("clientAddress with no trusted header named", () => {
  it("names the peer the socket says the request came from", () => {
    expect(clientAddress(requestFrom("203.0.113.7"), undefined)).toBe("203.0.113.7");
  });

  it("falls back to one shared caller when the socket can no longer name it", () => {
    // A socket that has already gone reports nothing. Grouping those together limits them
    // as a whole, which is safer than letting each one through as a caller of its own.
    expect(clientAddress(requestFrom(undefined), undefined)).toBe("");
  });

  it("ignores a forwarding header, because an unproxied caller would be naming itself", () => {
    const request = requestFrom("203.0.113.7", { "X-Forwarded-For": "198.51.100.9" });

    expect(clientAddress(request, undefined)).toBe("203.0.113.7");
  });
});

describe("clientAddress behind the proxy a deployment named", () => {
  it("reads the address out of that header rather than the proxy's own", () => {
    const request = requestFrom("10.0.0.1", { "X-Forwarded-For": "203.0.113.7" });

    expect(clientAddress(request, "X-Forwarded-For")).toBe("203.0.113.7");
  });

  it("takes the last hop, the only one the proxy in front of it appended", () => {
    // Everything to its left was sent by the caller and can say anything at all.
    const request = requestFrom("10.0.0.1", { "X-Forwarded-For": "1.1.1.1, 203.0.113.7" });

    expect(clientAddress(request, "X-Forwarded-For")).toBe("203.0.113.7");
  });

  it("falls back to the socket peer when the header is absent", () => {
    expect(clientAddress(requestFrom("10.0.0.1"), "X-Forwarded-For")).toBe("10.0.0.1");
  });

  it("falls back to the socket peer when the header arrives empty", () => {
    const request = requestFrom("10.0.0.1", { "X-Forwarded-For": "" });

    expect(clientAddress(request, "X-Forwarded-For")).toBe("10.0.0.1");
  });
});
