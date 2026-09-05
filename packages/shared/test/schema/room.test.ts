import { describe, expect, it } from "vitest";
import { newRoomSchema, roomIdParamSchema, roomSchema } from "../../src/schema/index.ts";

const point = { lat: 46.7712, lng: 23.6236 };

describe("newRoomSchema", () => {
  it("accepts a point on the map", () => {
    expect(newRoomSchema.parse(point)).toEqual(point);
  });

  it("accepts the extremes of both ranges", () => {
    expect(newRoomSchema.parse({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 });
  });

  it.each([
    ["a latitude past the pole", { lat: 90.1, lng: 0 }],
    ["a longitude past the antimeridian", { lat: 0, lng: -180.1 }],
    ["coordinates sent as text", { lat: "46.77", lng: "23.62" }],
    ["a missing longitude", { lat: 46.77 }],
    ["a latitude that is not a number", { lat: Number.NaN, lng: 0 }],
  ])("rejects %s", (_case, input) => {
    expect(newRoomSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a smuggled field rather than dropping it", () => {
    expect(newRoomSchema.safeParse({ ...point, name: "Chatroom 99" }).success).toBe(false);
  });
});

describe("roomSchema", () => {
  it("accepts a room as the server stores it", () => {
    const room = {
      id: "0199c0de-1234-7abc-8def-0123456789ab",
      name: "Chatroom 1",
      ...point,
      createdAt: "2026-09-05T10:00:00.000Z",
    };

    expect(roomSchema.parse(room)).toEqual(room);
  });

  it("rejects a timestamp that is only a date", () => {
    const room = {
      id: "0199c0de-2222-7abc-8def-0123456789ab",
      name: "Chatroom 1",
      ...point,
      createdAt: "2026-09-05",
    };

    expect(roomSchema.safeParse(room).success).toBe(false);
  });

  it("rejects an unnamed room", () => {
    const room = {
      id: "0199c0de-3333-7abc-8def-0123456789ab",
      name: "",
      ...point,
      createdAt: "2026-09-05T10:00:00.000Z",
    };

    expect(roomSchema.safeParse(room).success).toBe(false);
  });
});

describe("roomIdParamSchema", () => {
  it("accepts a uuid in the path", () => {
    const id = "0199c0de-4444-7abc-8def-0123456789ab";

    expect(roomIdParamSchema.parse({ id })).toEqual({ id });
  });

  it("rejects a path segment that is not a uuid", () => {
    expect(roomIdParamSchema.safeParse({ id: "1 OR 1=1" }).success).toBe(false);
  });
});
