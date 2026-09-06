import * as z from "zod";

/**
 * PostgreSQL stores no NUL inside a text value and the driver throws on one, which would
 * answer a crafted post with a 500 where FR-8 asks for a 4xx. The check is appended, so the
 * value is trimmed and measured first and the rules a person types against are unchanged.
 */
const carriesNoNullCharacter = (value: string) => !value.includes("\u0000");
const nullCharacterRefusal = "A null character is not allowed.";

export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(carriesNoNullCharacter, nullCharacterRefusal);
export const messageBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(carriesNoNullCharacter, nullCharacterRefusal);

/**
 * The id travels with the message so a retry after a dropped response is stored once;
 * the server owns `createdAt`, because the client clock is not ordering evidence.
 */
export const newMessageSchema = z.strictObject({
  id: z.uuid(),
  username: usernameSchema,
  body: messageBodySchema,
});

export const messageSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  username: usernameSchema,
  body: messageBodySchema,
  createdAt: z.iso.datetime(),
});

export const MESSAGE_PAGE_SIZE = 200;

/** `after` is the last message the caller already holds, so a reconnect asks only for the gap. */
export const messageHistoryQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(MESSAGE_PAGE_SIZE),
});

export type NewMessage = z.infer<typeof newMessageSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;
