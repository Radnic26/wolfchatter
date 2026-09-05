import { zValidator } from "@hono/zod-validator";
import { messageHistoryQuerySchema, newMessageSchema, roomIdParamSchema } from "@wolfchatter/shared/schema";
import { Hono } from "hono";
import type { Queryable } from "../db/db.ts";
import { failWith } from "../lib/api-error.ts";
import { limitBody } from "../lib/limit-body.ts";
import { rejectInvalidInput } from "../lib/reject-invalid-input.ts";
import { roomExists } from "../rooms/queries.ts";
import { findMessage, insertMessage, listMessages } from "./queries.ts";

export function createMessageRoutes(db: Queryable) {
  return new Hono()
    .get(
      "/rooms/:id/messages",
      zValidator("param", roomIdParamSchema, rejectInvalidInput),
      zValidator("query", messageHistoryQuerySchema, rejectInvalidInput),
      async (c) => {
        const { id } = c.req.valid("param");
        if (!(await roomExists(db, id))) {
          return failWith(c, "room_not_found", 404);
        }

        const page = c.req.valid("query");
        // A cursor the room never held means the client is asking from a history that is
        // not this one. Answering with an empty page would look like "you are up to date".
        if (page.after !== undefined && !(await findMessage(db, id, page.after))) {
          return failWith(c, "invalid_cursor", 400);
        }

        return c.json(await listMessages(db, id, page));
      },
    )
    .post(
      "/rooms/:id/messages",
      limitBody,
      zValidator("param", roomIdParamSchema, rejectInvalidInput),
      zValidator("json", newMessageSchema, rejectInvalidInput),
      async (c) => {
        const { id } = c.req.valid("param");
        if (!(await roomExists(db, id))) {
          return failWith(c, "room_not_found", 404);
        }

        const result = await insertMessage(db, id, c.req.valid("json"));
        if (result.outcome === "id-taken") {
          return failWith(c, "message_id_taken", 409);
        }

        // A retry of a message that is already stored is a success, not a new message.
        return c.json(result.message, result.outcome === "created" ? 201 : 200);
      },
    );
}
