import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatStore, createChatStore } from "../../src/client/index.ts";
import type { Room } from "../../src/schema/index.ts";
import { randomUuid } from "../support/random-uuid.ts";

const room = (overrides: Partial<Room> = {}): Room => ({
  id: randomUuid(),
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
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
