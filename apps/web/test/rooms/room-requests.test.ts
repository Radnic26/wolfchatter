import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom, fetchRooms } from "../../src/rooms/room-requests.ts";

const storedRoom = {
  id: randomUUID(),
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
};

function answerWith(body: unknown, init: ResponseInit = {}): ReturnType<typeof vi.fn> {
  const fetching = vi.fn(async () => Response.json(body, init));
  vi.stubGlobal("fetch", fetching);
  return fetching;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRooms", () => {
  it("asks the rooms endpoint on this origin", async () => {
    const fetching = answerWith([storedRoom]);

    await fetchRooms();

    expect(String(fetching.mock.calls[0]?.[0])).toBe("/api/rooms");
  });

  it("returns the rooms the server sent", async () => {
    answerWith([storedRoom]);

    expect(await fetchRooms()).toEqual([storedRoom]);
  });

  it("refuses a body that is not a list of rooms, rather than rendering nonsense", async () => {
    answerWith([{ id: storedRoom.id, name: "Chatroom 1" }]);

    await expect(fetchRooms()).rejects.toThrow();
  });

  it("fails loudly when the server does not answer with rooms", async () => {
    answerWith({ error: { code: "internal_error", requestId: "abc" } }, { status: 500 });

    await expect(fetchRooms()).rejects.toThrow(/500/);
  });
});

describe("createRoom", () => {
  it("posts the point under the id the caller minted", async () => {
    const fetching = answerWith(storedRoom, { status: 201 });
    const point = { id: storedRoom.id, lat: storedRoom.lat, lng: storedRoom.lng };

    await createRoom(point);

    const [url, request] = fetching.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/rooms");
    expect((request as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((request as RequestInit).body))).toEqual(point);
  });

  it("returns the room the server named", async () => {
    answerWith({ ...storedRoom, name: "Chatroom 7" }, { status: 201 });

    expect((await createRoom({ id: storedRoom.id, lat: 1, lng: 2 })).name).toBe("Chatroom 7");
  });

  it("accepts the room a retry finds already stored", async () => {
    answerWith(storedRoom, { status: 200 });

    expect(await createRoom({ id: storedRoom.id, lat: 1, lng: 2 })).toEqual(storedRoom);
  });

  it("fails loudly when the server rejects the point", async () => {
    answerWith({ error: { code: "invalid_request", requestId: "abc" } }, { status: 400 });

    await expect(createRoom({ id: storedRoom.id, lat: 1, lng: 2 })).rejects.toThrow(/400/);
  });
});
