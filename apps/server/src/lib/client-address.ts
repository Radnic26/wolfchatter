import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * Who a request is attributed to for the per-IP limit: the peer's address as the socket
 * reports it. A forwarding header is deliberately not read — neither deployment puts a
 * proxy in front of this process, so `X-Forwarded-For` would be a caller naming itself.
 */
export function clientAddress(c: Context): string {
  return getConnInfo(c).remote.address ?? "";
}
