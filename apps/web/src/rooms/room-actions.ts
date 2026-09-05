import type { ChatStore } from "@wolfchatter/shared/client";
import type { NewRoom } from "@wolfchatter/shared/schema";
import { createRoom, fetchRooms } from "./room-requests.ts";

export async function loadRooms(store: ChatStore): Promise<void> {
  store.setStoredRooms(await fetchRooms());
}

/**
 * The pin and its panel are on screen before the request leaves, because NFR-1 gives them
 * 100 ms and a round trip is not part of that budget. If the server never confirms it, the
 * pin goes back off the map rather than sitting there pointing at nothing.
 */
export async function openRoomAt(store: ChatStore, point: NewRoom): Promise<void> {
  store.openRoom(point);

  try {
    store.storeRoom(await createRoom(point));
  } catch (failure) {
    store.removeRoom(point.id);
    throw failure;
  }
}
