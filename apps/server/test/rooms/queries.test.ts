import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { insertRoom, listRooms, roomExists } from "../../src/rooms/queries.ts";
import { databasesUnderTest, openMigratedDatabase } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };

describe.each(databasesUnderTest)("room queries on $name", (database) => {
  let db: Db;

  afterEach(async () => {
    await db.close();
  });

  it("names the first room Chatroom 1 and stores where it was clicked", async () => {
    db = await openMigratedDatabase(database);

    const room = await insertRoom(db, cluj);

    expect(room).toMatchObject({ name: "Chatroom 1", ...cluj });
    expect(room.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("counts on from there for every further room", async () => {
    db = await openMigratedDatabase(database);

    await insertRoom(db, cluj);
    const second = await insertRoom(db, { lat: 0, lng: 0 });

    expect(second.name).toBe("Chatroom 2");
  });

  it("gives fifty rooms created at once fifty different names", async () => {
    db = await openMigratedDatabase(database);

    const rooms = await Promise.all(Array.from({ length: 50 }, () => insertRoom(db, cluj)));

    const names = rooms.map((room) => room.name);
    expect(new Set(names).size).toBe(50);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(50);
  });

  it("numbers concurrently created rooms without a gap", async () => {
    db = await openMigratedDatabase(database);

    const rooms = await Promise.all(Array.from({ length: 20 }, () => insertRoom(db, cluj)));

    expect(new Set(rooms.map((room) => room.name))).toEqual(
      new Set(Array.from({ length: 20 }, (_unused, index) => `Chatroom ${index + 1}`)),
    );
  });

  it("lists the rooms in the order they were created", async () => {
    db = await openMigratedDatabase(database);
    await insertRoom(db, cluj);
    await insertRoom(db, { lat: 10, lng: 20 });

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

    const room = await insertRoom(db, { lat: -89.999999, lng: 179.999999 });

    expect(room).toMatchObject({ lat: -89.999999, lng: 179.999999 });
  });

  it("knows whether a room exists", async () => {
    db = await openMigratedDatabase(database);
    const room = await insertRoom(db, cluj);

    await expect(roomExists(db, room.id)).resolves.toBe(true);
    await expect(roomExists(db, "0199c0de-9999-7abc-8def-0123456789ab")).resolves.toBe(false);
  });
});
