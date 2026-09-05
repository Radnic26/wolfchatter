import * as z from "zod";

/**
 * The whole vocabulary a client may branch on. Bodies carry a code and a request id and
 * never the exception, so an error tells the caller what to do without describing the server.
 */
export const errorCodeSchema = z.enum([
  "invalid_request",
  "invalid_frame",
  "invalid_cursor",
  "message_id_taken",
  "room_not_found",
  "not_found",
  "payload_too_large",
  "internal_error",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    requestId: z.uuid(),
  }),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
