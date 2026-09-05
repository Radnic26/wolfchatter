import * as z from "zod";
import { type FrameParseResult, parseFrame } from "./parse-frame.ts";

/**
 * Everything a client may say. Writes travel over HTTP, so the socket carries only which
 * rooms this connection follows, plus the heartbeat that proves it is still there.
 */
export const clientFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("subscribe"), roomId: z.uuid() }),
  z.strictObject({ type: z.literal("unsubscribe"), roomId: z.uuid() }),
  z.strictObject({ type: z.literal("ping") }),
]);

export type ClientFrame = z.infer<typeof clientFrameSchema>;

export function parseClientFrame(raw: string): FrameParseResult<ClientFrame> {
  return parseFrame(clientFrameSchema, raw);
}
