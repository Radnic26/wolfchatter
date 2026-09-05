import { randomUUID } from "node:crypto";
import { MESSAGE_PAGE_SIZE, type Message } from "@wolfchatter/shared/schema";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { findMessage, insertMessage, listMessages, type MessageInsert } from "../../src/messages/queries.ts";
import { insertRoom } from "../../src/rooms/queries.ts";
import { databasesUnderTest, openMigratedDatabase } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };
const wholePage = { limit: MESSAGE_PAGE_SIZE };

/** Ids come from the client as random v4 uuids, so the fixtures use the same distribution. */
function posted(body: string) {
  return { id: randomUUID(), username: "radu", body };
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
    await db?.close();
  });

  async function openRoom(): Promise<string> {
    const { room } = await insertRoom(db, { id: randomUUID(), ...cluj });
    return room.id;
  }

  async function roomWithMessages(count: number): Promise<{ roomId: string; sent: Message[] }> {
    const roomId = await openRoom();
    const sent: Message[] = [];
    for (let index = 0; index < count; index++) {
      sent.push(storedBy(await insertMessage(db, roomId, posted(`message ${index}`))));
    }
    return { roomId, sent };
  }

  it("stores a message under the room and stamps it server-side", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const message = posted("hello");

    const result = await insertMessage(db, roomId, message);

    expect(result).toMatchObject({
      outcome: "created",
      message: { id: message.id, roomId, username: "radu", body: "hello" },
    });
  });

  it("stores a message resent with the same id only once", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const message = posted("hello");

    const first = await insertMessage(db, roomId, message);
    const retry = await insertMessage(db, roomId, message);

    expect(first.outcome).toBe("created");
    expect(retry).toEqual({ outcome: "already-stored", message: storedBy(first) });
    await expect(listMessages(db, roomId, wholePage)).resolves.toHaveLength(1);
  });

  it("keeps the first text when the same id comes back with a different body", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const message = posted("first");
    await insertMessage(db, roomId, message);

    const retry = await insertMessage(db, roomId, {
      ...message,
      username: "someone-else",
      body: "rewritten",
    });

    expect(retry).toMatchObject({ outcome: "already-stored", message: { username: "radu", body: "first" } });
  });

  it("refuses an id already spent in another room instead of leaking that message", async () => {
    db = await openMigratedDatabase(database);
    const first = await openRoom();
    const second = await openRoom();
    const message = posted("private to the first room");
    await insertMessage(db, first, message);

    const collision = await insertMessage(db, second, message);

    expect(collision).toEqual({ outcome: "id-taken" });
    await expect(listMessages(db, second, wholePage)).resolves.toEqual([]);
  });

  it("returns twenty concurrent messages once each", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const messages = Array.from({ length: 20 }, (_unused, index) => posted(`message ${index}`));

    await Promise.all(
      messages.flatMap((message) => [insertMessage(db, roomId, message), insertMessage(db, roomId, message)]),
    );

    await expect(listMessages(db, roomId, wholePage)).resolves.toHaveLength(20);
  });

  it("keeps a burst of messages in the order it accepted them, not in id order", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(50);

    const history = await listMessages(db, roomId, wholePage);

    // Fifty messages posted this fast share only a handful of timestamps, so ordering by
    // time alone would fall back to the random ids and shuffle the conversation.
    expect(history.map((message) => message.body)).toEqual(sent.map((message) => message.body));
    expect(new Set(history.map((message) => message.createdAt)).size).toBeLessThan(50);
  });

  it("returns only what came after the cursor", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(5);

    const missed = await listMessages(db, roomId, { after: sent[1]?.id, limit: MESSAGE_PAGE_SIZE });

    expect(missed).toEqual(sent.slice(2));
  });

  it("backfills a message stored after the one the client saw even when they share a timestamp", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const seenLive = { id: "ffffffff-0000-4000-8000-000000000001", username: "radu", body: "seen live" };
    const arrivedAfter = {
      id: "00000000-0000-4000-8000-000000000002",
      username: "radu",
      body: "arrived after the drop",
    };

    // One transaction gives both rows the same now(), which is what a real burst does on
    // its own. The second id deliberately sorts below the first.
    await db.transaction(async (tx) => {
      await insertMessage(tx, roomId, seenLive);
      await insertMessage(tx, roomId, arrivedAfter);
    });

    const backfill = await listMessages(db, roomId, { after: seenLive.id, limit: MESSAGE_PAGE_SIZE });

    expect(backfill.map((message) => message.body)).toEqual(["arrived after the drop"]);
  });

  it("returns nothing when the client already holds the newest message", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(3);

    await expect(
      listMessages(db, roomId, { after: sent.at(-1)?.id, limit: MESSAGE_PAGE_SIZE }),
    ).resolves.toEqual([]);
  });

  it("gives a reader of a busy room the newest page, not the oldest", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(MESSAGE_PAGE_SIZE + 5);

    const page = await listMessages(db, roomId, wholePage);

    expect(page).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(page.at(-1)).toEqual(sent.at(-1));
    expect(page).toEqual(sent.slice(-MESSAGE_PAGE_SIZE));
  });

  it("catches up from a cursor oldest first, so the client reads the gap in order", async () => {
    db = await openMigratedDatabase(database);
    const { roomId, sent } = await roomWithMessages(5);

    const page = await listMessages(db, roomId, { after: sent[0]?.id, limit: 2 });

    expect(page).toEqual(sent.slice(1, 3));
  });

  it("keeps one room's history out of another's", async () => {
    db = await openMigratedDatabase(database);
    const { roomId } = await roomWithMessages(2);
    const other = await openRoom();

    await expect(listMessages(db, other, wholePage)).resolves.toEqual([]);
    await expect(listMessages(db, roomId, wholePage)).resolves.toHaveLength(2);
  });

  it("finds a stored message inside its own room only", async () => {
    db = await openMigratedDatabase(database);
    const roomId = await openRoom();
    const other = await openRoom();
    const message = posted("hello");
    await insertMessage(db, roomId, message);

    await expect(findMessage(db, roomId, message.id)).resolves.toMatchObject({ body: "hello" });
    await expect(findMessage(db, other, message.id)).resolves.toBeUndefined();
  });
});
