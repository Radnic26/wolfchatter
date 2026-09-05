import { type ClientFrame, parseServerFrame } from "../protocol/index.ts";
import type { Message } from "../schema/index.ts";
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
   * Follow a room and load what it holds. The promise is the loading: a socket that is not
   * up yet is not a failure, because the next connection catches the room up on its own.
   */
  subscribe(roomId: string): Promise<void>;
  unsubscribe(roomId: string): void;
  close(): void;
}

export function createChatClient({ url, store, fetchHistory }: ChatClientOptions): ChatClient {
  const following = new Set<string>();
  /** Live messages held while a room's gap is in flight, so the gap lands ahead of them. */
  const catchingUp = new Map<string, Message[]>();
  let socket: Socket | undefined;
  let retry: unknown;
  let attempt = 0;
  let wanted = false;
  let connection: ConnectionStatus = "connecting";

  function report(status: ConnectionStatus): void {
    connection = status;
    store.setConnection(status);
  }

  function send(frame: ClientFrame): void {
    socket?.send(JSON.stringify(frame));
  }

  async function catchUp(roomId: string): Promise<void> {
    const after = store.getSnapshot().messagesByRoom.get(roomId)?.at(-1)?.id;
    const waiting: Message[] = [];
    catchingUp.set(roomId, waiting);

    try {
      const missed = await fetchHistory(roomId, after);
      // A room this client holds nothing of gets the newest page; one it has been reading
      // gets only the gap, appended to what it already shows.
      if (after === undefined) store.setMessages(roomId, missed);
      else for (const message of missed) store.addMessage(message);
    } finally {
      // Whatever arrived while the gap was in flight goes in after it and never before, so
      // the order stays the server's. A second catch-up may have started meanwhile and is
      // now the one collecting, which is why the entry is only cleared by its own owner.
      for (const message of waiting) store.addMessage(message);
      if (catchingUp.get(roomId) === waiting) catchingUp.delete(roomId);
    }
  }

  function follow(roomId: string): Promise<void> {
    send({ type: "subscribe", roomId });
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
        else store.addMessage(parsed.frame.message);
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
      if (!wanted) return;

      socket = undefined;
      report("reconnecting");

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

    async subscribe(roomId) {
      following.add(roomId);
      if (connection !== "live") return;

      await follow(roomId);
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
