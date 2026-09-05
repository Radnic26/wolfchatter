import { type Context, type ErrorHandler, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Queryable } from "./db/db.ts";
import { failWith } from "./lib/api-error.ts";
import { limitWritesPerCaller } from "./lib/rate-limit.ts";
import { createMessageRoutes } from "./messages/routes.ts";
import { createRoomRoutes } from "./rooms/routes.ts";
import type { Broadcaster } from "./ws/broadcaster.ts";
import { createSocketRoutes } from "./ws/routes.ts";

/**
 * Anything the framework itself rejects before a handler runs — a body that is not JSON,
 * above all — arrives here as a client error and has to stay one. Only a genuine fault
 * becomes a 500, and neither answer repeats what the exception said.
 */
const respondToFailure: ErrorHandler = (error, c) =>
  error instanceof HTTPException && error.status < 500
    ? failWith(c, "invalid_request", error.status, String(error))
    : failWith(c, "internal_error", 500, String(error));

export interface AppDependencies {
  db: Queryable;
  /** Where a stored row goes once it is committed. The routes never touch a socket. */
  broadcaster: Broadcaster;
  allowedOrigins: readonly string[];
  /** Who a write is attributed to, and the monotonic clock its allowance refills on. */
  addressOf: (c: Context) => string;
  now: () => number;
}

/** Routes stay chained on one instance so `hc<AppType>` can infer them in the web app. */
export function createApp({ db, broadcaster, allowedOrigins, addressOf, now }: AppDependencies) {
  const limitWrites = limitWritesPerCaller({ addressOf, now });

  return (
    new Hono()
      .get("/api/health", (c) => c.json({ status: "ok" as const }))
      .route("/api", createRoomRoutes({ db, broadcaster, limitWrites }))
      .route("/api", createMessageRoutes({ db, broadcaster, limitWrites }))
      .route("/", createSocketRoutes(allowedOrigins))
      // The API answers for its own namespace here, because the process wraps this app in
      // the static handler that serves the single-page shell for every other deep link.
      // Without this line an unknown endpoint would hand a client HTML with a 200.
      .all("/api/*", (c) => failWith(c, "not_found", 404))
      // Anywhere else, when there is no front end built to fall back to: still the shape a
      // client parses, never Hono's plain-text default.
      .notFound((c) => failWith(c, "not_found", 404))
      .onError(respondToFailure)
  );
}

export type AppType = ReturnType<typeof createApp>;
