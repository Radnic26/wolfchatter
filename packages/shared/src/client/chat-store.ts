import type { NewRoom, Room } from "../schema/index.ts";

/**
 * A pin on the map. The click draws one before the server has answered, so for a moment a
 * pin has a place but no name: the name comes from an identity column and guessing the
 * next number would show the wrong one whenever someone else clicked first.
 */
export type MapRoom = ({ status: "pending" } & NewRoom) | ({ status: "stored" } & Room);

export type ChatSnapshot = {
  rooms: readonly MapRoom[];
};

/**
 * The one place room state lives, so a native shell can reuse it and `useSyncExternalStore`
 * has something to read. Every change publishes a new snapshot object and leaves the old
 * one untouched, which is what stops React from looping.
 */
export type ChatStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ChatSnapshot;
  setStoredRooms: (rooms: readonly Room[]) => void;
  openRoom: (point: NewRoom) => void;
  storeRoom: (room: Room) => void;
  removeRoom: (roomId: string) => void;
};

function stored(room: Room): MapRoom {
  return { status: "stored", ...room };
}

export function createChatStore(): ChatStore {
  const listeners = new Set<() => void>();
  let snapshot: ChatSnapshot = { rooms: [] };

  function publish(rooms: readonly MapRoom[]): void {
    snapshot = { rooms };
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,

    setStoredRooms(rooms) {
      const arrived = new Set(rooms.map((room) => room.id));
      // Someone can click while the first list is still in flight; their pin outlives it.
      const unanswered = snapshot.rooms.filter((room) => room.status === "pending" && !arrived.has(room.id));
      publish([...rooms.map(stored), ...unanswered]);
    },

    openRoom(point) {
      publish([...snapshot.rooms, { status: "pending", ...point }]);
    },

    storeRoom(room) {
      const known = snapshot.rooms.findIndex((pin) => pin.id === room.id);
      publish(known === -1 ? [...snapshot.rooms, stored(room)] : snapshot.rooms.with(known, stored(room)));
    },

    removeRoom(roomId) {
      publish(snapshot.rooms.filter((room) => room.id !== roomId));
    },
  };
}
