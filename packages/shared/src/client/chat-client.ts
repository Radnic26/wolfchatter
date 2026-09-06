import { type ClientFrame, parseServerFrame } from "../protocol/index.ts";
import { MESSAGE_PAGE_SIZE, type Message } from "../schema/index.ts";
import type { ChatStore, ConnectionStatus } from "./chat-store.ts";

/**
 * The globals both a browser and a React Native runtime provide, declared here rather than
 * dragged in as a dependency: this package compiles without the DOM's types so that a
 * native shell can use it unchanged.
 */
interface Socket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}
declare const WebSocket: { new (url: string): Socket };
declare const setTimeout: (run: () => void, milliseconds: number) => unknown;
declare const clearTimeout: (handle: unknown) => void;
declare const console: { warn: (...parts: unknown[]) => void };

const firstRetryMilliseconds = 500;
const longestRetryMilliseconds = 30_000;

export interface ChatClientOptions {
  url: string;
  store: ChatStore;
  /**
   * What the room has said since a message, or its newest page when the caller holds none.
   * Injected, because the typed HTTP client belongs to the app that has one.
   */
  fetchHistory: (roomId: string, after: string | undefined) => Promise<readonly Message[]>;
}

export interface ChatClient {
  connect(): void;
  /**
   * Follow a room and load what it holds. The promise is the loading, and it runs whether or
   * not the socket is up: the history is HTTP's, so a room still opens with the connection
   * down and the next one only adds what has been said since.
   */
  subscribe(roomId: string): Promise<void>;
  unsubscribe(roomId: string): void;
  close(): void;
}

export function createChatClient({ url, store, fetchHistory }: ChatClientOptions): ChatClient {
  const following = new Set<string>();
  /** Live messages held while a room's gap is in flight, so the gap lands ahead of them. */
  const catchingUp = new Map<string, Message[]>();
  /**
   * How far each room's server-ordered stream has been read. The store's own last message is
   * not that place: one this browser posted while the socket was down sits at the end of it,
   * and asking for the gap after that one skips everything said in the meantime.
   */
  const lastSeenByRoom = new Map<string, string>();
  let socket: Socket | undefined;
  let retry: unknown;
  let attempt = 0;
  let wanted = false;
  let hasBeenLive = false;
  let connection: ConnectionStatus = "connecting";

  function report(status: ConnectionStatus): void {
    connection = status;
    store.setConnection(status);
  }

  function send(frame: ClientFrame): void {
    socket?.send(JSON.stringify(frame));
  }

  /** A message from the socket is the server's own order, so it moves the back-fill cursor. */
  function applyLive(message: Message): void {
    store.addMessage(message);
    lastSeenByRoom.set(message.roomId, message.id);
  }

  /**
   * A room this client holds nothing of gets the newest page; one it has been reading gets
   * only the gap, appended to what it already shows.
   */
  function applyPage(roomId: string, page: readonly Message[], holdsNothing: boolean): void {
    if (holdsNothing) store.setMessages(roomId, page);
    else for (const message of page) store.addMessage(message);

    const newest = page.at(-1);
    if (newest) lastSeenByRoom.set(roomId, newest.id);
  }

  async function catchUp(roomId: string): Promise<void> {
    const waiting: Message[] = [];
    catchingUp.set(roomId, waiting);

    try {
      // A gap longer than one page would be truncated for the life of the session, so the
      // gap is read until a page comes back short. The cursor is the last message of the
      // page just taken and `after` is exclusive, so each ask starts past the previous one.
      let isPageFull = true;
      while (isPageFull) {
        const after = lastSeenByRoom.get(roomId);
        const page = await fetchHistory(roomId, after);
        // A catch-up started while this one was in flight is now the room's: writing a page
        // read before it would put the room back to what it held then.
        if (catchingUp.get(roomId) !== waiting) return;

        applyPage(roomId, page, after === undefined);
        // Only a gap can span pages. A room read cold is answered with the newest page, so
        // there is nothing past it to ask for and asking would cost an empty round trip.
        isPageFull = after !== undefined && page.length === MESSAGE_PAGE_SIZE;
      }
    } finally {
      // Whatever arrived while the gap was in flight goes in after it and never before, so
      // the order stays the server's. A second catch-up may have started meanwhile and is
      // now the one collecting, which is why the entry is only cleared by its own owner.
      for (const message of waiting) store.addMessage(message);
      if (catchingUp.get(roomId) === waiting) catchingUp.delete(roomId);
    }
  }

  function follow(roomId: string): Promise<void> {
    if (connection === "live") send({ type: "subscribe", roomId });
    return catchUp(roomId);
  }

  function receive(raw: unknown): void {
    const parsed = parseServerFrame(String(raw));
    if (!parsed.ok) {
      console.warn("The server sent a frame this client cannot read");
      return;
    }

    switch (parsed.frame.type) {
      case "room:created":
        store.storeRoom(parsed.frame.room);
        return;
      case "message:created": {
        const waiting = catchingUp.get(parsed.frame.message.roomId);
        if (waiting) waiting.push(parsed.frame.message);
        else applyLive(parsed.frame.message);
        return;
      }
      case "pong":
        return;
      case "error":
        console.warn(`The server refused a frame: ${parsed.frame.code}`);
        return;
    }
  }

  function open(): void {
    const opening = new WebSocket(url);
    socket = opening;

    opening.onopen = () => {
      attempt = 0;
      hasBeenLive = true;
      report("live");

      // Subscribed first and caught up second: a message posted between the two arrives on
      // the socket and is de-duplicated by id, where the other order loses it for good.
      for (const roomId of following) {
        follow(roomId).catch((failure: unknown) => {
          console.warn("The messages missed while away could not be loaded", failure);
        });
      }
    };

    opening.onmessage = (event) => receive(event.data);

    opening.onclose = () => {
      // A browser delivers the close event after `close()` has returned, so a socket the
      // client has already replaced still gets one: acting on it would drop the connection
      // that is up and open a second one alongside it.
      if (!wanted || socket !== opening) return;

      socket = undefined;
      report(hasBeenLive ? "reconnecting" : "connecting");

      // Full jitter, not a fixed step: without it every client that dropped at the same
      // moment comes back at the same moment, and the recovery is the second outage.
      const ceiling = Math.min(longestRetryMilliseconds, firstRetryMilliseconds * 2 ** attempt);
      attempt += 1;
      retry = setTimeout(open, Math.random() * ceiling);
    };
  }

  return {
    connect() {
      if (wanted) return;

      wanted = true;
      attempt = 0;
      report("connecting");
      open();
    },

    subscribe(roomId) {
      following.add(roomId);
      return follow(roomId);
    },

    unsubscribe(roomId) {
      following.delete(roomId);
      if (connection === "live") send({ type: "unsubscribe", roomId });
    },

    close() {
      wanted = false;
      clearTimeout(retry);
      socket?.close();
      socket = undefined;
    },
  };
}
