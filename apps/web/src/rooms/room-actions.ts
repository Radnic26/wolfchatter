import type { ChatStore } from "@wolfchatter/shared/client";
import { randomUuid } from "./random-uuid.ts";
import { createRoom, fetchRooms } from "./room-requests.ts";

export async function loadRooms(store: ChatStore): Promise<void> {
  store.setStoredRooms(await fetchRooms());
}

/**
 * The pin and its panel are on screen before the request leaves, because NFR-1 gives them
 * 100 ms and a round trip is not part of that budget. If the server never confirms it, the
 * pin goes back off the map rather than sitting there pointing at nothing.
 */
export async function openRoomAt(store: ChatStore, at: { lat: number; lng: number }): Promise<string> {
  const point = { id: randomUuid(), ...at };
  store.openRoom(point);

  try {
    store.storeRoom(await createRoom(point));
  } catch (failure) {
    store.removeRoom(point.id);
    throw failure;
  }

  return point.id;
}
