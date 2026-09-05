import { zValidator } from "@hono/zod-validator";
import { newRoomSchema } from "@wolfchatter/shared/schema";
import { Hono, type MiddlewareHandler } from "hono";
import type { Queryable } from "../db/db.ts";
import { limitBody } from "../lib/limit-body.ts";
import { rejectInvalidInput } from "../lib/reject-invalid-input.ts";
import type { Broadcaster } from "../ws/broadcaster.ts";
import { insertRoom, listRooms } from "./queries.ts";

export interface RoomRoutesDependencies {
  db: Queryable;
  broadcaster: Broadcaster;
  limitWrites: MiddlewareHandler;
}

export function createRoomRoutes({ db, broadcaster, limitWrites }: RoomRoutesDependencies) {
  return new Hono()
    .get("/rooms", async (c) => c.json(await listRooms(db)))
    .post(
      "/rooms",
      limitWrites,
      limitBody,
      zValidator("json", newRoomSchema, rejectInvalidInput),
      async (c) => {
        const { outcome, room } = await insertRoom(db, c.req.valid("json"));

        // The row is committed before anyone hears about it, so a client that reacts by
        // asking the API finds it there. A retry of a click that already opened a room is
        // a success rather than a second room, and announcing it twice would draw two pins.
        if (outcome === "created") broadcaster.publishRoomCreated(room);

        return c.json(room, outcome === "created" ? 201 : 200);
      },
    );
}
