import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { seedSampleData } from "../../src/db/seed.ts";
import { listMessages } from "../../src/messages/queries.ts";
import { insertRoom, listRooms } from "../../src/rooms/queries.ts";
import { databasesUnderTest, openMigratedDatabase } from "../support/databases.ts";

describe.each(databasesUnderTest)("seeding sample data on $name", (database) => {
  let db: Db;

  afterEach(async () => {
    await db?.close();
  });

  it("fills an empty database with rooms a first run can see on the map", async () => {
    db = await openMigratedDatabase(database);

    const seeded = await seedSampleData(db);
    const rooms = await listRooms(db);

    expect(seeded).toBeGreaterThan(0);
    expect(rooms).toHaveLength(seeded);
    expect(rooms[0]).toMatchObject({ name: "Chatroom 1" });
  });

  it("gives every seeded room a conversation to show when it is opened", async () => {
    db = await openMigratedDatabase(database);

    await seedSampleData(db);
    const rooms = await listRooms(db);
    const histories = await Promise.all(rooms.map((room) => listMessages(db, room.id, { limit: 200 })));

    expect(histories.every((messages) => messages.length > 0)).toBe(true);
  });

  it("puts every seeded room somewhere real on the globe", async () => {
    db = await openMigratedDatabase(database);

    await seedSampleData(db);
    const rooms = await listRooms(db);

    for (const room of rooms) {
      expect(Math.abs(room.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(room.lng)).toBeLessThanOrEqual(180);
    }
  });

  it("leaves a database that already has rooms alone", async () => {
    db = await openMigratedDatabase(database);
    await insertRoom(db, { id: randomUUID(), lat: 46.7712, lng: 23.6236 });

    const seeded = await seedSampleData(db);

    expect(seeded).toBe(0);
    expect(await listRooms(db)).toHaveLength(1);
  });

  it("adds nothing on a second boot, so the map does not grow a copy of itself", async () => {
    db = await openMigratedDatabase(database);

    const first = await seedSampleData(db);
    const second = await seedSampleData(db);

    expect(second).toBe(0);
    expect(await listRooms(db)).toHaveLength(first);
  });
});
