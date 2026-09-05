import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { failWith } from "../lib/api-error.ts";
import { isAllowedOrigin } from "./origin-allowlist.ts";

/**
 * Hono answers one question here — may this connection be upgraded — and from the socket
 * server's `connection` event on, the hub owns the socket: the subscriptions, the queue and
 * the heartbeat all need what a framework wrapper hides. Nothing on this route touches a
 * header, because the upgrade would not survive it.
 */
export function createSocketRoutes(allowedOrigins: readonly string[]) {
  return new Hono().get(
    "/ws",
    async (c, next) => {
      const origin = c.req.header("origin");
      if (!isAllowedOrigin(origin, allowedOrigins)) {
        return failWith(c, "invalid_request", 403, `refused origin ${origin ?? "(absent)"}`);
      }

      await next();
    },
    upgradeWebSocket(() => ({})),
  );
}
