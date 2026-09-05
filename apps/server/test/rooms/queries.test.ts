import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { insertRoom, listRooms, roomExists } from "../../src/rooms/queries.ts";
import { databasesUnderTest, openMigratedDatabase } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };

function click(point = cluj) {
  return { id: randomUUID(), ...point };
}

describe.each(databasesUnderTest)("room queries on $name", (database) => {
  let db: Db;

  afterEach(async () => {
    await db?.close();
  });

  it("names the first room Chatroom 1 and stores where it was clicked", async () => {
    db = await openMigratedDatabase(database);

    const { outcome, room } = await insertRoom(db, click());

    expect(outcome).toBe("created");
    expect(room).toMatchObject({ name: "Chatroom 1", ...cluj });
    expect(room.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("counts on from there for every further room", async () => {
    db = await openMigratedDatabase(database);

    await insertRoom(db, click());
    const second = await insertRoom(db, click({ lat: 0, lng: 0 }));

    expect(second.room.name).toBe("Chatroom 2");
  });

  it("opens one room when the same click is retried", async () => {
    db = await openMigratedDatabase(database);
    const gesture = click();

    const first = await insertRoom(db, gesture);
    const retry = await insertRoom(db, gesture);

    expect(first.outcome).toBe("created");
    expect(retry).toEqual({ outcome: "already-stored", room: first.room });
    await expect(listRooms(db)).resolves.toHaveLength(1);
  });

  it("keeps the first position when a retried click reports a different point", async () => {
    db = await openMigratedDatabase(database);
    const id = randomUUID();
    await insertRoom(db, { id, ...cluj });

    const retry = await insertRoom(db, { id, lat: 0, lng: 0 });

    expect(retry.room).toMatchObject({ name: "Chatroom 1", ...cluj });
  });

  it("gives fifty rooms created at once fifty different names", async () => {
    db = await openMigratedDatabase(database);

    const created = await Promise.all(Array.from({ length: 50 }, () => insertRoom(db, click())));

    const names = created.map(({ room }) => room.name);
    expect(new Set(names).size).toBe(50);
    expect(new Set(created.map(({ room }) => room.id)).size).toBe(50);
  });

  it("numbers concurrently created rooms without a gap", async () => {
    db = await openMigratedDatabase(database);

    const created = await Promise.all(Array.from({ length: 20 }, () => insertRoom(db, click())));

    expect(new Set(created.map(({ room }) => room.name))).toEqual(
      new Set(Array.from({ length: 20 }, (_unused, index) => `Chatroom ${index + 1}`)),
    );
  });

  it("lists the rooms in the order they were created", async () => {
    db = await openMigratedDatabase(database);
    await insertRoom(db, click());
    await insertRoom(db, click({ lat: 10, lng: 20 }));

    const rooms = await listRooms(db);

    expect(rooms.map((room) => room.name)).toEqual(["Chatroom 1", "Chatroom 2"]);
    expect(rooms[1]).toMatchObject({ lat: 10, lng: 20 });
  });

  it("lists nothing on an empty map", async () => {
    db = await openMigratedDatabase(database);

    await expect(listRooms(db)).resolves.toEqual([]);
  });

  it("keeps the exact coordinates it was given", async () => {
    db = await openMigratedDatabase(database);

    const { room } = await insertRoom(db, click({ lat: -89.999999, lng: 179.999999 }));

    expect(room).toMatchObject({ lat: -89.999999, lng: 179.999999 });
  });

  it("knows whether a room exists", async () => {
    db = await openMigratedDatabase(database);
    const { room } = await insertRoom(db, click());

    await expect(roomExists(db, room.id)).resolves.toBe(true);
    await expect(roomExists(db, randomUUID())).resolves.toBe(false);
  });
});
