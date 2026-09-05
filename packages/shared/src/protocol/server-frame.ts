import * as z from "zod";
import { errorCodeSchema, messageSchema, roomSchema } from "../schema/index.ts";
import { type FrameParseResult, parseFrame } from "./parse-frame.ts";

/**
 * Everything the server may push. Each event carries the whole row it announces, so a
 * client renders it without a follow-up request and de-duplicates it by id.
 */
export const serverFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("room:created"), room: roomSchema }),
  z.strictObject({ type: z.literal("message:created"), message: messageSchema }),
  z.strictObject({ type: z.literal("pong") }),
  z.strictObject({ type: z.literal("error"), code: errorCodeSchema }),
]);

export type ServerFrame = z.infer<typeof serverFrameSchema>;

export function parseServerFrame(raw: string): FrameParseResult<ServerFrame> {
  return parseFrame(serverFrameSchema, raw);
}
