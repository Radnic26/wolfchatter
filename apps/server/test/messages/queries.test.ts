import { MESSAGE_PAGE_SIZE, type Message } from "@wolfchatter/shared/schema";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { findMessage, insertMessage, listMessages, type MessageInsert } from "../../src/messages/queries.ts";
import { insertRoom } from "../../src/rooms/queries.ts";
import { databasesUnderTest, openMigratedDatabase } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };
const wholeHistory = { limit: MESSAGE_PAGE_SIZE };

function messageId(suffix: string): string {
  return `0199c0de-${suffix}-7abc-8def-0123456789ab`;
}

/** Narrows an insert to the row it stored, so a collision fails the test where it happens. */
function storedBy(result: MessageInsert): Message {
  if (result.outcome === "id-taken") {
    throw new Error("expected the message to be stored, but its id was taken by another room");
  }
  return result.message;
}

describe.each(databasesUnderTest)("message queries on $name", (database) => {
  let db: Db;

  afterEach(async () => {
    await db.close();
  });

  async function roomWithMessages(count: number): Promise<{ roomId: string; sent: Message[] }> {
    const room = await insertRoom(db, cluj);
    const sent: Message[] = [];
    for (let index = 0; index < count; index++) {
      const result = await insertMessage(db, room.id, {
        id: messageId(String(1000 + index)),
        username: "radu",
        body: `message ${index}`,
      });
      sent.push(storedBy(result));
    }
    return { roomId: room.id, sent };
  }

  it("stores a message under the room and stamps it server-side", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);

    const result = await insertMessage(db, room.id, {
      id: messageId("1234"),
      username: "radu",
      body: "hello",
    });

    expect(result).toMatchObject({
      outcome: "created",
      message: { id: messageId("1234"), roomId: room.id, username: "radu", body: "hello" },
    });
  });

  it("stores a message resent with the same id only once", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);
    const posted = { id: messageId("1234"), username: "radu", body: "hello" };

    const first = await insertMessage(db, room.id, posted);
    const retry = await insertMessage(db, room.id, posted);

    expect(first.outcome).toBe("created");
    expect(retry).toEqual({ outcome: "already-stored", message: storedBy(first) });
    await expect(listMessages(db, room.id, wholeHistory)).resolves.toHaveLength(1);
  });

  it("keeps the first text when the same id comes back with a different body", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);
    const id = messageId("1234");
    await insertMessage(db, room.id, { id, username: "radu", body: "first" });

    const retry = await insertMessage(db, room.id, { id, username: "someone-else", body: "rewritten" });

    expect(retry).toMatchObject({ outcome: "already-stored", message: { username: "radu", body: "first" } });
  });

  it("refuses an id already spent in another room instead of leaking that message", async () => {
    db = await openMigratedDatabase(database);
    const first = await insertRoom(db, cluj);
    const second = await insertRoom(db, cluj);
    const id = messageId("1234");
    await insertMessage(db, first.id, { id, username: "radu", body: "private to the first room" });

    const collision = await insertMessage(db, second.id, { id, username: "radu", body: "elsewhere" });

    expect(collision).toEqual({ outcome: "id-taken" });
    await expect(listMessages(db, second.id, wholeHistory)).resolves.toEqual([]);
  });

  it("returns twenty concurrent messages once each", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);
    const posted = Array.from({ length: 20 }, (_unused, index) => ({
      id: messageId(String(2000 + index)),
      username: "radu",
      body: `message ${index}`,
    }));

    await Promise.all(
      posted.flatMap((message) => [insertMessage(db, room.id, message), insertMessage(db, room.id, message)]),
    );

    await expect(listMessages(db, room.id, wholeHistory)).resolves.toHaveLength(20);
  });

  it("reads the history oldest first", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(3);

    const history = await listMessages(db, roomId, wholeHistory);

    expect(history).toEqual(sent);
  });

  it("returns only what came after the cursor", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(5);

    const missed = await listMessages(db, roomId, { after: sent[1]?.id, limit: MESSAGE_PAGE_SIZE });

    expect(missed).toEqual(sent.slice(2));
  });

  it("returns nothing when the client already holds the newest message", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(3);

    await expect(
      listMessages(db, roomId, { after: sent.at(-1)?.id, limit: MESSAGE_PAGE_SIZE }),
    ).resolves.toEqual([]);
  });

  it("stops at the limit it was asked for", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(5);

    await expect(listMessages(db, roomId, { limit: 2 })).resolves.toEqual(sent.slice(0, 2));
    await expect(listMessages(db, roomId, { after: sent[0]?.id, limit: 2 })).resolves.toEqual(
      sent.slice(1, 3),
    );
  });

  it("keeps one room's history out of another's", async () => {
    db = await openMigratedDatabase(database);
    const { roomId } = await roomWithMessages(2);
    const other = await insertRoom(db, cluj);

    await expect(listMessages(db, other.id, wholeHistory)).resolves.toEqual([]);
    await expect(listMessages(db, roomId, wholeHistory)).resolves.toHaveLength(2);
  });

  it("finds a stored message inside its own room only", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);
    const other = await insertRoom(db, cluj);
    const id = messageId("1234");
    await insertMessage(db, room.id, { id, username: "radu", body: "hello" });

    await expect(findMessage(db, room.id, id)).resolves.toMatchObject({ body: "hello" });
    await expect(findMessage(db, other.id, id)).resolves.toBeUndefined();
  });
});
