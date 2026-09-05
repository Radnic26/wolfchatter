import { type Message, type NewRoom, type Room, usernameSchema } from "../schema/index.ts";

/**
 * A pin on the map. The click draws one before the server has answered, so for a moment a
 * pin has a place but no name: the name comes from an identity column and guessing the
 * next number would show the wrong one whenever someone else clicked first.
 */
export type MapRoom = ({ status: "pending" } & NewRoom) | ({ status: "stored" } & Room);

/**
 * Where the name a browser posts under is kept is the shell's business: the web app hands
 * over `localStorage`, a native shell would hand over its own, and a store built without
 * one simply forgets between reloads.
 */
export type UsernameStorage = {
  read: () => string;
  write: (username: string) => void;
};

export type ChatSnapshot = {
  rooms: readonly MapRoom[];
  messagesByRoom: ReadonlyMap<string, readonly Message[]>;
  username: string;
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
  setMessages: (roomId: string, messages: readonly Message[]) => void;
  addMessage: (message: Message) => void;
  setUsername: (username: string) => void;
};

function stored(room: Room): MapRoom {
  return { status: "stored", ...room };
}

function forgetful(): UsernameStorage {
  let held = "";
  return {
    read: () => held,
    write: (username) => {
      held = username;
    },
  };
}

/** Whatever was kept between visits is input from outside the process like any other. */
function remembered(storage: UsernameStorage): string {
  const parsed = usernameSchema.safeParse(storage.read());
  return parsed.success ? parsed.data : "";
}

export function createChatStore(storage: UsernameStorage = forgetful()): ChatStore {
  const listeners = new Set<() => void>();
  let snapshot: ChatSnapshot = {
    rooms: [],
    messagesByRoom: new Map(),
    username: remembered(storage),
  };

  function publish(change: Partial<ChatSnapshot>): void {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  }

  function withMessages(roomId: string, messages: readonly Message[]): Partial<ChatSnapshot> {
    return { messagesByRoom: new Map(snapshot.messagesByRoom).set(roomId, messages) };
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
      publish({ rooms: [...rooms.map(stored), ...unanswered] });
    },

    openRoom(point) {
      publish({ rooms: [...snapshot.rooms, { status: "pending", ...point }] });
    },

    storeRoom(room) {
      const known = snapshot.rooms.findIndex((pin) => pin.id === room.id);
      publish({
        rooms: known === -1 ? [...snapshot.rooms, stored(room)] : snapshot.rooms.with(known, stored(room)),
      });
    },

    removeRoom(roomId) {
      publish({ rooms: snapshot.rooms.filter((room) => room.id !== roomId) });
    },

    /**
     * A page from the server, kept in the order it arrived in. That order is the identity
     * column the server sorts on, which no field of a message carries, so re-sorting here
     * on anything — `createdAt` above all — could only shuffle a burst that shares a second.
     */
    setMessages(roomId, messages) {
      publish(withMessages(roomId, messages));
    },

    /** The same message can arrive twice — a retry, and later the socket's echo of a post. */
    addMessage(message) {
      const held = snapshot.messagesByRoom.get(message.roomId) ?? [];
      if (held.some((kept) => kept.id === message.id)) return;

      publish(withMessages(message.roomId, [...held, message]));
    },

    setUsername(username) {
      storage.write(username);
      publish({ username });
    },
  };
}
