import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatStore, createChatStore } from "../../src/client/index.ts";
import type { Message, Room } from "../../src/schema/index.ts";
import { randomUuid } from "../support/random-uuid.ts";

const room = (overrides: Partial<Room> = {}): Room => ({
  id: randomUuid(),
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

const message = (roomId: string, overrides: Partial<Message> = {}): Message => ({
  id: randomUuid(),
  roomId,
  username: "ana",
  body: "hello",
  createdAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

describe("createChatStore", () => {
  let store: ChatStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it("starts with no rooms, which is what draws the empty state", () => {
    expect(store.getSnapshot().rooms).toEqual([]);
  });

  it("keeps the order the server sent, which is the order the rooms were numbered in", () => {
    const first = room({ name: "Chatroom 1" });
    const second = room({ name: "Chatroom 2" });

    store.setStoredRooms([first, second]);

    expect(store.getSnapshot().rooms.map((pin) => pin.id)).toEqual([first.id, second.id]);
  });

  it("draws a pin for a click the server has not answered yet, with no name on it", () => {
    const point = { id: randomUuid(), lat: 10, lng: 20 };

    store.openRoom(point);

    expect(store.getSnapshot().rooms).toEqual([{ status: "pending", ...point }]);
  });

  it("gives the pin its name in place when the server answers", () => {
    const created = room({ name: "Chatroom 7" });
    store.openRoom({ id: created.id, lat: created.lat, lng: created.lng });

    store.storeRoom(created);

    expect(store.getSnapshot().rooms).toEqual([{ status: "stored", ...created }]);
  });

  it("keeps a room that was stored while another was still pending in its own place", () => {
    const first = room({ name: "Chatroom 1" });
    const second = room({ name: "Chatroom 2" });
    store.openRoom({ id: first.id, lat: first.lat, lng: first.lng });
    store.openRoom({ id: second.id, lat: second.lat, lng: second.lng });

    store.storeRoom(second);

    expect(store.getSnapshot().rooms.map((pin) => pin.status)).toEqual(["pending", "stored"]);
    expect(store.getSnapshot().rooms.map((pin) => pin.id)).toEqual([first.id, second.id]);
  });

  it("adds a room it has never seen, which is how another client's room arrives", () => {
    const elsewhere = room({ name: "Chatroom 4" });

    store.storeRoom(elsewhere);

    expect(store.getSnapshot().rooms).toEqual([{ status: "stored", ...elsewhere }]);
  });

  it("keeps a pin clicked while the first list was still in flight", () => {
    const clicked = { id: randomUuid(), lat: 1, lng: 2 };
    store.openRoom(clicked);

    store.setStoredRooms([room()]);

    expect(store.getSnapshot().rooms.at(-1)).toEqual({ status: "pending", ...clicked });
  });

  it("does not keep a pin the arriving list already accounts for", () => {
    const created = room();
    store.openRoom({ id: created.id, lat: created.lat, lng: created.lng });

    store.setStoredRooms([created]);

    expect(store.getSnapshot().rooms).toEqual([{ status: "stored", ...created }]);
  });

  it("takes a pin back off the map, which is what a failed creation needs", () => {
    const kept = room();
    const lost = { id: randomUuid(), lat: 1, lng: 2 };
    store.setStoredRooms([kept]);
    store.openRoom(lost);

    store.removeRoom(lost.id);

    expect(store.getSnapshot().rooms.map((pin) => pin.id)).toEqual([kept.id]);
  });

  it("tells every listener that something changed", () => {
    const listener = vi.fn();
    store.subscribe(listener);

    store.openRoom({ id: randomUuid(), lat: 1, lng: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener that has unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.openRoom({ id: randomUuid(), lat: 1, lng: 2 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("hands out a new snapshot on a change and the same one otherwise, so React settles", () => {
    const before = store.getSnapshot();

    expect(store.getSnapshot()).toBe(before);

    store.openRoom({ id: randomUuid(), lat: 1, lng: 2 });

    expect(store.getSnapshot()).not.toBe(before);
    expect(before.rooms).toEqual([]);
  });
});

describe("createChatStore messages", () => {
  let store: ChatStore;
  const roomId = randomUuid();

  beforeEach(() => {
    store = createChatStore();
  });

  it("holds no messages for a room nobody has read yet", () => {
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toBeUndefined();
  });

  it("keeps a page in the order the server sent it, which is the order it numbered them in", () => {
    const first = message(roomId, { body: "first", createdAt: "2026-09-05T10:00:02.000Z" });
    const second = message(roomId, { body: "second", createdAt: "2026-09-05T10:00:01.000Z" });

    store.setMessages(roomId, [first, second]);

    expect(
      store
        .getSnapshot()
        .messagesByRoom.get(roomId)
        ?.map((kept) => kept.body),
    ).toEqual(["first", "second"]);
  });

  it("replaces the page it holds, so a room re-read is not a room read twice", () => {
    const only = message(roomId, { body: "only" });
    store.setMessages(roomId, [message(roomId), message(roomId)]);

    store.setMessages(roomId, [only]);

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([only]);
  });

  it("appends a message after the ones already held", () => {
    const held = message(roomId, { body: "held" });
    const arrived = message(roomId, { body: "arrived" });
    store.setMessages(roomId, [held]);

    store.addMessage(arrived);

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([held, arrived]);
  });

  it("appends to a room it holds nothing for, which is the first message ever posted", () => {
    const first = message(roomId);

    store.addMessage(first);

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([first]);
  });

  it("ignores a message whose id it already holds, so a retry is stored once", () => {
    const posted = message(roomId);
    store.addMessage(posted);

    store.addMessage({ ...posted, body: "the same message, echoed back" });

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([posted]);
  });

  it("tells no listener about a message it already held, so nothing re-renders for a duplicate", () => {
    const posted = message(roomId);
    store.addMessage(posted);
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.addMessage(posted);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);
  });

  it("keeps each room's history apart, so switching rooms shows the right one", () => {
    const other = randomUuid();
    store.addMessage(message(roomId, { body: "here" }));

    store.addMessage(message(other, { body: "there" }));

    expect(
      store
        .getSnapshot()
        .messagesByRoom.get(roomId)
        ?.map((kept) => kept.body),
    ).toEqual(["here"]);
    expect(
      store
        .getSnapshot()
        .messagesByRoom.get(other)
        ?.map((kept) => kept.body),
    ).toEqual(["there"]);
  });

  it("leaves the rooms alone when a message arrives, so the map is not redrawn for a line of chat", () => {
    store.setStoredRooms([room()]);
    const { rooms } = store.getSnapshot();

    store.addMessage(message(roomId));

    expect(store.getSnapshot().rooms).toBe(rooms);
  });
});

describe("createChatStore username", () => {
  it("starts with no name when nothing was kept", () => {
    expect(createChatStore().getSnapshot().username).toBe("");
  });

  it("starts with the name the last visit left behind", () => {
    const store = createChatStore({ read: () => "ana", write: vi.fn() });

    expect(store.getSnapshot().username).toBe("ana");
  });

  it("trims what was kept, because that is the name a message would be posted under", () => {
    const store = createChatStore({ read: () => "  ana  ", write: vi.fn() });

    expect(store.getSnapshot().username).toBe("ana");
  });

  it("refuses a kept name no client could have posted, rather than pre-filling nonsense", () => {
    const store = createChatStore({ read: () => "n".repeat(33), write: vi.fn() });

    expect(store.getSnapshot().username).toBe("");
  });

  it("writes the name through, so the next visit opens with it", () => {
    const write = vi.fn();
    const store = createChatStore({ read: () => "", write });

    store.setUsername("ana");

    expect(write).toHaveBeenCalledWith("ana");
    expect(store.getSnapshot().username).toBe("ana");
  });

  it("remembers within the session even with nowhere to keep it", () => {
    const store = createChatStore();

    store.setUsername("ana");

    expect(store.getSnapshot().username).toBe("ana");
  });
});

describe("createChatStore connection", () => {
  it("starts out connecting, because nothing has been reached yet", () => {
    expect(createChatStore().getSnapshot().connection).toBe("connecting");
  });

  it("tells whoever is watching that the connection changed", () => {
    const store = createChatStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setConnection("live");

    expect(store.getSnapshot().connection).toBe("live");
    expect(listener).toHaveBeenCalledOnce();
  });
});
