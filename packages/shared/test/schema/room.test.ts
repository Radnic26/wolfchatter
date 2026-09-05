import { describe, expect, it } from "vitest";
import { newRoomSchema, roomIdParamSchema, roomSchema } from "../../src/schema/index.ts";

const point = { lat: 46.7712, lng: 23.6236 };
const clickId = "0199c0de-1111-7abc-8def-0123456789ab";
const click = { id: clickId, ...point };

describe("newRoomSchema", () => {
  it("accepts a click on the map under the id it can be retried with", () => {
    expect(newRoomSchema.parse(click)).toEqual(click);
  });

  it("accepts the extremes of both ranges", () => {
    const corner = { id: clickId, lat: -90, lng: 180 };

    expect(newRoomSchema.parse(corner)).toEqual(corner);
  });

  it("rejects a click with no id, because a retry could not be recognised", () => {
    expect(newRoomSchema.safeParse(point).success).toBe(false);
  });

  it.each([
    ["a latitude past the pole", { id: clickId, lat: 90.1, lng: 0 }],
    ["a longitude past the antimeridian", { id: clickId, lat: 0, lng: -180.1 }],
    ["coordinates sent as text", { id: clickId, lat: "46.77", lng: "23.62" }],
    ["a missing longitude", { id: clickId, lat: 46.77 }],
    ["a latitude that is not a number", { id: clickId, lat: Number.NaN, lng: 0 }],
    ["an id that is not a uuid", { id: "first-click", ...point }],
  ])("rejects %s", (_case, input) => {
    expect(newRoomSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a smuggled field rather than dropping it", () => {
    expect(newRoomSchema.safeParse({ ...click, name: "Chatroom 99" }).success).toBe(false);
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
