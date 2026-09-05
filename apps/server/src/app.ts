import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Queryable } from "./db/db.ts";
import { failWith } from "./lib/api-error.ts";
import { createMessageRoutes } from "./messages/routes.ts";
import { createRoomRoutes } from "./rooms/routes.ts";

/**
 * Anything the framework itself rejects before a handler runs — a body that is not JSON,
 * above all — arrives here as a client error and has to stay one. Only a genuine fault
 * becomes a 500, and neither answer repeats what the exception said.
 */
function respondToFailure(error: Error, c: Parameters<Parameters<Hono["onError"]>[0]>[1]) {
  return error instanceof HTTPException && error.status < 500
    ? failWith(c, "invalid_request", error.status, String(error))
    : failWith(c, "internal_error", 500, String(error));
}

/** Routes stay chained on one instance so `hc<AppType>` can infer them in the web app. */
export function createApp(db: Queryable) {
  return new Hono()
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api", createRoomRoutes(db))
    .route("/api", createMessageRoutes(db))
    .onError(respondToFailure);
}

export type AppType = ReturnType<typeof createApp>;
