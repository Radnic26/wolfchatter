import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readSelectedRoomId, withSelectedRoom } from "../../src/rooms/selected-room-url.ts";

describe("readSelectedRoomId", () => {
  it("reads the room out of the query string", () => {
    const id = randomUUID();

    expect(readSelectedRoomId(`?room=${id}`)).toBe(id);
  });

  it("selects nothing when no room is named", () => {
    expect(readSelectedRoomId("")).toBeNull();
    expect(readSelectedRoomId("?zoom=5")).toBeNull();
  });

  it("selects nothing for an id nobody could have minted", () => {
    expect(readSelectedRoomId("?room=chatroom-1")).toBeNull();
    expect(readSelectedRoomId("?room=")).toBeNull();
  });
});

describe("withSelectedRoom", () => {
  it("names the room in the query string", () => {
    const id = randomUUID();

    expect(withSelectedRoom("https://wolfchatter.test/", id)).toBe(`/?room=${id}`);
  });

  it("replaces the room already named rather than adding a second", () => {
    const id = randomUUID();

    expect(withSelectedRoom(`https://wolfchatter.test/?room=${randomUUID()}`, id)).toBe(`/?room=${id}`);
  });

  it("drops the room when nothing is selected", () => {
    expect(withSelectedRoom(`https://wolfchatter.test/?room=${randomUUID()}`, null)).toBe("/");
  });

  it("leaves the rest of the link alone", () => {
    const id = randomUUID();

    expect(withSelectedRoom("https://wolfchatter.test/app?zoom=5#map", id)).toBe(
      `/app?zoom=5&room=${id}#map`,
    );
  });
});
