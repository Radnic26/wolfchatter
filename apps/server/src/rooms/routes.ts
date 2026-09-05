import { zValidator } from "@hono/zod-validator";
import { newRoomSchema } from "@wolfchatter/shared/schema";
import { Hono } from "hono";
import type { Queryable } from "../db/db.ts";
import { limitBody } from "../lib/limit-body.ts";
import { rejectInvalidInput } from "../lib/reject-invalid-input.ts";
import { insertRoom, listRooms } from "./queries.ts";

export function createRoomRoutes(db: Queryable) {
  return new Hono()
    .get("/rooms", async (c) => c.json(await listRooms(db)))
    .post("/rooms", limitBody, zValidator("json", newRoomSchema, rejectInvalidInput), async (c) => {
      const { outcome, room } = await insertRoom(db, c.req.valid("json"));
      // A retry of a click that already opened a room is a success, not a second room.
      return c.json(room, outcome === "created" ? 201 : 200);
    });
}
