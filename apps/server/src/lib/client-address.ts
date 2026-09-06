import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Who a request is attributed to for the per-IP limit. The socket peer is the honest answer
 * when clients reach this process directly, and the only safe one: a caller can put any
 * address in a forwarding header, so reading one unasked would let it spend somebody else's
 * allowance. Behind a proxy that terminates TLS the peer is the proxy, and every caller
 * would then share a single allowance, so a deployment that has one names the header its
 * own proxy appends to. The last value is that proxy's, the ones before it the client's.
 */
export function clientAddress(c: Context, trustedHeader: string | undefined): string {
  const peerAddress = getConnInfo(c).remote.address ?? "";
  if (trustedHeader === undefined) return peerAddress;

  const lastHop = c.req.header(trustedHeader)?.split(",").at(-1)?.trim();
  return lastHop === undefined || lastHop === "" ? peerAddress : lastHop;
}
