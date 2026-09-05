import { zValidator } from "@hono/zod-validator";
import { newRoomSchema } from "@wolfchatter/shared/schema";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Queryable } from "../db/db.ts";
import { failWith } from "../lib/api-error.ts";
import { rejectInvalidInput } from "../lib/reject-invalid-input.ts";
import { insertRoom, listRooms } from "./queries.ts";

/** A click on the map is a write, so it travels over HTTP where it can be validated and capped. */
export const MAXIMUM_BODY_BYTES = 16 * 1024;

export const limitBody = bodyLimit({
  maxSize: MAXIMUM_BODY_BYTES,
  onError: (c) => failWith(c, "payload_too_large", 413),
});

export function createRoomRoutes(db: Queryable) {
  return new Hono()
    .get("/rooms", async (c) => c.json(await listRooms(db)))
    .post("/rooms", limitBody, zValidator("json", newRoomSchema, rejectInvalidInput), async (c) => {
      const room = await insertRoom(db, c.req.valid("json"));
      return c.json(room, 201);
    });
}
