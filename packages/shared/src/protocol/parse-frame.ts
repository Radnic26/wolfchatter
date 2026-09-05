import type * as z from "zod";
import type { ErrorCode } from "../schema/index.ts";

export type FrameParseResult<Frame> = { ok: true; frame: Frame } | { ok: false; code: ErrorCode };

/**
 * A frame arrives as text from an untrusted peer, so malformed JSON is an expected
 * answer rather than an exception: both ends reply with an error frame and stay open.
 */
export function parseFrame<Schema extends z.ZodType>(
  schema: Schema,
  raw: string,
): FrameParseResult<z.infer<Schema>> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, code: "invalid_frame" };
  }

  const result = schema.safeParse(parsedJson);
  return result.success ? { ok: true, frame: result.data } : { ok: false, code: "invalid_frame" };
}
