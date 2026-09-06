import { describe, expect, it } from "vitest";
import {
  MESSAGE_PAGE_SIZE,
  messageHistoryQuerySchema,
  messageSchema,
  newMessageSchema,
} from "../../src/schema/index.ts";

const posted = { id: "0199c0de-1234-7abc-8def-0123456789ab", username: "radu", body: "hello" };

describe("newMessageSchema", () => {
  it("accepts a message with its idempotency key", () => {
    expect(newMessageSchema.parse(posted)).toEqual(posted);
  });

  it("trims the surrounding whitespace it was given", () => {
    expect(newMessageSchema.parse({ ...posted, username: "  radu  ", body: "  hello  " })).toEqual(posted);
  });

  it.each([
    ["a username that is only whitespace", { ...posted, username: "   " }],
    ["an empty body", { ...posted, body: "" }],
    ["a username over 32 characters", { ...posted, username: "a".repeat(33) }],
    ["a body over 500 characters", { ...posted, body: "a".repeat(501) }],
    ["a username carrying a null character", { ...posted, username: "ra\u0000du" }],
    ["a body carrying a null character", { ...posted, body: "hel\u0000lo" }],
    ["a message without an id", { username: "radu", body: "hello" }],
    ["an id that is not a uuid", { ...posted, id: "42" }],
  ])("rejects %s", (_case, input) => {
    expect(newMessageSchema.safeParse(input).success).toBe(false);
  });

  it("accepts the longest username and body the form allows", () => {
    const longest = { ...posted, username: "a".repeat(32), body: "b".repeat(500) };

    expect(newMessageSchema.parse(longest)).toEqual(longest);
  });

  it("rejects a client-supplied timestamp instead of trusting it", () => {
    expect(newMessageSchema.safeParse({ ...posted, createdAt: "2000-01-01T00:00:00.000Z" }).success).toBe(
      false,
    );
  });
});

describe("messageSchema", () => {
  it("accepts a message as the server stores it", () => {
    const message = {
      ...posted,
      roomId: "0199c0de-2222-7abc-8def-0123456789ab",
      createdAt: "2026-09-05T10:00:00.000Z",
    };

    expect(messageSchema.parse(message)).toEqual(message);
  });

  it("rejects a message that belongs to no room", () => {
    expect(messageSchema.safeParse({ ...posted, createdAt: "2026-09-05T10:00:00.000Z" }).success).toBe(false);
  });
});

describe("messageHistoryQuerySchema", () => {
  it("asks for one page from the beginning when the query is empty", () => {
    expect(messageHistoryQuerySchema.parse({})).toEqual({ limit: MESSAGE_PAGE_SIZE });
  });

  it("reads the limit from the string the URL carries", () => {
    expect(messageHistoryQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
  });

  it("keeps the cursor the client last saw", () => {
    const after = "0199c0de-3333-7abc-8def-0123456789ab";

    expect(messageHistoryQuerySchema.parse({ after })).toEqual({ after, limit: MESSAGE_PAGE_SIZE });
  });

  it.each([
    ["a cursor that is not a uuid", { after: "latest" }],
    ["a limit of zero", { limit: "0" }],
    ["a limit past the cap", { limit: "501" }],
    ["a fractional limit", { limit: "1.5" }],
    ["a limit that is not a number", { limit: "all" }],
  ])("rejects %s", (_case, input) => {
    expect(messageHistoryQuerySchema.safeParse(input).success).toBe(false);
  });
});
