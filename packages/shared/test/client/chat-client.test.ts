import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatClient,
  type ChatStore,
  createChatClient,
  createChatStore,
} from "../../src/client/index.ts";
import { MESSAGE_PAGE_SIZE, type Message, type Room } from "../../src/schema/index.ts";
import { randomUuid } from "../support/random-uuid.ts";
import { type FakeSockets, stubWebSocket } from "../support/socket.ts";

/** Declared rather than imported, for the reason `test/support/random-uuid.ts` gives. */
declare const console: { warn: (...parts: unknown[]) => void };

const longestPossibleRetry = 30_000;

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

describe("createChatClient", () => {
  let sockets: FakeSockets;
  let store: ChatStore;
  let client: ChatClient;
  let asked: { roomId: string; after: string | undefined }[];
  let answer: (roomId: string, after: string | undefined) => Promise<readonly Message[]>;
  let warned: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sockets = stubWebSocket();
    store = createChatStore();
    asked = [];
    answer = async () => [];
    client = createChatClient({
      url: "ws://localhost/ws",
      store,
      fetchHistory: (roomId, after) => {
        asked.push({ roomId, after });
        return answer(roomId, after);
      },
    });
  });

  afterEach(() => {
    client.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says it is connecting until the socket is actually up", () => {
    client.connect();

    expect(store.getSnapshot().connection).toBe("connecting");

    sockets.newest().open();

    expect(store.getSnapshot().connection).toBe("live");
  });

  it("opens one socket however many times it is asked to connect", () => {
    client.connect();
    client.connect();

    expect(sockets.opened).toHaveLength(1);
  });

  it("subscribes to a room and asks for the newest page when it holds none of it", async () => {
    const roomId = randomUuid();
    const newest = message(roomId);
    answer = async () => [newest];
    client.connect();
    sockets.newest().open();

    await client.subscribe(roomId);

    expect(sockets.newest().sent).toEqual([{ type: "subscribe", roomId }]);
    expect(asked).toEqual([{ roomId, after: undefined }]);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([newest]);
  });

  it("asks only for the gap after the last message the server sent it", async () => {
    const roomId = randomUuid();
    const older = message(roomId, { body: "first" });
    const newest = message(roomId, { body: "second" });
    const missed = message(roomId, { body: "third" });
    answer = async (_roomId, after) => (after === undefined ? [older, newest] : [missed]);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    await client.subscribe(roomId);

    expect(asked.at(-1)).toEqual({ roomId, after: newest.id });
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([older, newest, missed]);
  });

  it("asks after the last message the server sent, not the last one this browser posted", async () => {
    const roomId = randomUuid();
    const theirs = message(roomId, { body: "sent to everyone" });
    answer = async (_roomId, after) => (after === undefined ? [theirs] : []);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    // A post goes over HTTP whatever the socket is doing, so it reaches the room the way
    // any accepted message does: at the end of what this browser shows.
    store.addMessage(message(roomId, { body: "posted while the socket was down" }));
    sockets.newest().drop();
    vi.advanceTimersByTime(longestPossibleRetry);
    sockets.newest().open();
    await vi.waitFor(() => expect(asked).toHaveLength(2));

    expect(asked.at(-1)).toEqual({ roomId, after: theirs.id });
  });

  it("asks after the last message the socket delivered", async () => {
    const roomId = randomUuid();
    const live = message(roomId);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    sockets.newest().deliver({ type: "message:created", message: live });
    sockets.newest().drop();
    vi.advanceTimersByTime(longestPossibleRetry);
    sockets.newest().open();
    await vi.waitFor(() => expect(asked).toHaveLength(2));

    expect(asked.at(-1)).toEqual({ roomId, after: live.id });
  });

  it("reads page after page while a gap comes back full, so a gap longer than one is whole", async () => {
    const roomId = randomUuid();
    const read = message(roomId, { body: "read on the way in" });
    const gapHead = Array.from({ length: MESSAGE_PAGE_SIZE }, () => message(roomId));
    const gapTail = [message(roomId, { body: "the tail of the gap" })];
    answer = async (_roomId, after) => {
      if (after === undefined) return [read];
      return after === read.id ? gapHead : gapTail;
    };
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    await client.subscribe(roomId);

    expect(asked).toEqual([
      { roomId, after: undefined },
      { roomId, after: read.id },
      { roomId, after: gapHead.at(-1)?.id },
    ]);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([read, ...gapHead, ...gapTail]);
  });

  it("asks nothing more after a full page read cold, because that page is the newest one", async () => {
    const roomId = randomUuid();
    const newestPage = Array.from({ length: MESSAGE_PAGE_SIZE }, () => message(roomId));
    answer = async () => newestPage;
    client.connect();
    sockets.newest().open();

    await client.subscribe(roomId);

    expect(asked).toEqual([{ roomId, after: undefined }]);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual(newestPage);
  });

  it("takes a page in as one change, so a room with history is drawn once", async () => {
    const roomId = randomUuid();
    answer = async () => [message(roomId), message(roomId), message(roomId)];
    client.connect();
    sockets.newest().open();
    const listener = vi.fn();
    store.subscribe(listener);

    await client.subscribe(roomId);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("puts a message that arrived while the gap was in flight after the gap, not before", async () => {
    const roomId = randomUuid();
    const held = message(roomId, { body: "first" });
    const missed = message(roomId, { body: "second" });
    const live = message(roomId, { body: "third" });
    answer = async () => [held];
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    let hand: (page: readonly Message[]) => void = () => undefined;
    answer = () => new Promise<readonly Message[]>((resolve) => (hand = resolve));
    const subscribing = client.subscribe(roomId);

    sockets.newest().deliver({ type: "message:created", message: live });
    hand([missed]);
    await subscribing;

    expect(
      store
        .getSnapshot()
        .messagesByRoom.get(roomId)
        ?.map((held) => held.body),
    ).toEqual(["first", "second", "third"]);
  });

  it("drops a page that came back after a newer catch-up started, so a room never goes back", async () => {
    const roomId = randomUuid();
    const late = message(roomId, { body: "the answer to the first ask" });
    const current = message(roomId, { body: "the answer to the second" });
    const hands: ((page: readonly Message[]) => void)[] = [];
    answer = () => new Promise<readonly Message[]>((resolve) => hands.push(resolve));
    client.connect();
    sockets.newest().open();

    const first = client.subscribe(roomId);
    const second = client.subscribe(roomId);
    hands[1]?.([current]);
    hands[0]?.([late]);
    await Promise.all([first, second]);

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([current]);
  });

  it("keeps a live message that arrives with no gap in flight", async () => {
    const roomId = randomUuid();
    const live = message(roomId);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    sockets.newest().deliver({ type: "message:created", message: live });

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([live]);
  });

  it("stores a message the sender's own post already put there only once", async () => {
    const roomId = randomUuid();
    const own = message(roomId);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);
    store.addMessage(own);

    sockets.newest().deliver({ type: "message:created", message: own });

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([own]);
  });

  it("puts a room somebody else opened on the map, with no reload", () => {
    const opened = room();
    client.connect();
    sockets.newest().open();

    sockets.newest().deliver({ type: "room:created", room: opened });

    expect(store.getSnapshot().rooms).toEqual([{ status: "stored", ...opened }]);
  });

  it("follows a room again after a reconnect, and asks for what it missed", async () => {
    const roomId = randomUuid();
    const held = message(roomId);
    answer = async (_roomId, after) => (after === undefined ? [held] : []);
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    sockets.newest().drop();
    vi.advanceTimersByTime(longestPossibleRetry);
    sockets.newest().open();
    await vi.waitFor(() => expect(asked).toHaveLength(2));

    expect(sockets.newest().sent).toEqual([{ type: "subscribe", roomId }]);
    expect(asked.at(-1)).toEqual({ roomId, after: held.id });
  });

  it("survives a reconnect where the gap cannot be read, with nothing left unhandled", async () => {
    const roomId = randomUuid();
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);
    answer = async () => {
      throw new Error("the API is still down");
    };

    sockets.newest().drop();
    vi.advanceTimersByTime(longestPossibleRetry);
    sockets.newest().open();
    await vi.waitFor(() => expect(warned).toHaveBeenCalled());

    expect(store.getSnapshot().connection).toBe("live");
  });

  it("says it is still connecting when a first attempt never came up", () => {
    client.connect();

    sockets.newest().drop();

    expect(store.getSnapshot().connection).toBe("connecting");
  });

  it("says it is reconnecting the moment the connection is gone", () => {
    client.connect();
    sockets.newest().open();

    sockets.newest().drop();

    expect(store.getSnapshot().connection).toBe("reconnecting");
  });

  it("waits a jittered share of the delay before trying again, never the whole of it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    client.connect();
    sockets.newest().open();
    sockets.newest().drop();

    vi.advanceTimersByTime(249);
    expect(sockets.opened).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(sockets.opened).toHaveLength(2);
  });

  it("backs off further with every failure, and no further than the ceiling", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    client.connect();

    const waits: number[] = [];
    for (let failure = 0; failure < 8; failure += 1) {
      const before = sockets.opened.length;
      sockets.newest().drop();
      let waited = 0;
      while (sockets.opened.length === before) {
        vi.advanceTimersByTime(1);
        waited += 1;
      }
      waits.push(waited);
    }

    expect(waits).toEqual([500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
  });

  it("starts the wait over once a connection comes back", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    client.connect();
    sockets.newest().drop();
    vi.advanceTimersByTime(500);
    sockets.newest().open();

    sockets.newest().drop();
    vi.advanceTimersByTime(500);

    expect(sockets.opened).toHaveLength(3);
  });

  it("stops trying once it is closed, so an unmounted view leaves nothing running", () => {
    client.connect();
    sockets.newest().open();
    sockets.newest().drop();

    client.close();
    vi.advanceTimersByTime(longestPossibleRetry);

    expect(sockets.opened).toHaveLength(1);
  });

  it("closes the socket it holds when it is closed", () => {
    client.connect();
    sockets.newest().open();

    client.close();

    expect(sockets.newest().closedByClient).toBe(true);
  });

  it("does not reconnect when the close is the one it asked for", () => {
    client.connect();
    sockets.newest().open();

    client.close();
    vi.advanceTimersByTime(longestPossibleRetry);

    expect(sockets.opened).toHaveLength(1);
  });

  it("ignores the close of a socket it has already replaced", () => {
    client.connect();
    sockets.newest().open();
    client.close();

    client.connect();
    sockets.newest().open();
    vi.advanceTimersByTime(longestPossibleRetry);

    expect(store.getSnapshot().connection).toBe("live");
    expect(sockets.opened).toHaveLength(2);
  });

  it("stops following a room it has unsubscribed from", async () => {
    const roomId = randomUuid();
    client.connect();
    sockets.newest().open();
    await client.subscribe(roomId);

    client.unsubscribe(roomId);
    sockets.newest().drop();
    vi.advanceTimersByTime(longestPossibleRetry);
    sockets.newest().open();

    expect(sockets.opened[0]?.sent).toEqual([
      { type: "subscribe", roomId },
      { type: "unsubscribe", roomId },
    ]);
    expect(sockets.newest().sent).toEqual([]);
  });

  it("reads a room's history while the connection is down, because HTTP holds all of it", async () => {
    const roomId = randomUuid();
    const stored = message(roomId);
    answer = async () => [stored];
    client.connect();

    await client.subscribe(roomId);

    expect(asked).toEqual([{ roomId, after: undefined }]);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([stored]);
    expect(sockets.newest().sent).toEqual([]);
  });

  it("takes a subscription while the connection is down and follows the room when it is back", async () => {
    const roomId = randomUuid();
    client.connect();
    await client.subscribe(roomId);

    sockets.newest().open();
    await vi.waitFor(() => expect(asked).toHaveLength(2));

    expect(sockets.newest().sent).toEqual([{ type: "subscribe", roomId }]);
  });

  it("says nothing on the socket about a room unsubscribed while the connection is down", async () => {
    const roomId = randomUuid();
    client.connect();
    await client.subscribe(roomId);

    client.unsubscribe(roomId);
    sockets.newest().open();

    expect(sockets.newest().sent).toEqual([]);
  });

  it("hands a failed backfill to its caller, which is the view that shows the room", async () => {
    const roomId = randomUuid();
    answer = async () => {
      throw new Error("the network is gone");
    };
    client.connect();
    sockets.newest().open();

    await expect(client.subscribe(roomId)).rejects.toThrow("the network is gone");
  });

  it("keeps the live messages that arrived while a failed backfill was in flight", async () => {
    const roomId = randomUuid();
    const live = message(roomId);
    let refuse: (failure: Error) => void = () => undefined;
    answer = () => new Promise<readonly Message[]>((_resolve, reject) => (refuse = reject));
    client.connect();
    sockets.newest().open();
    const subscribing = client.subscribe(roomId);

    sockets.newest().deliver({ type: "message:created", message: live });
    refuse(new Error("the network is gone"));
    await expect(subscribing).rejects.toThrow("the network is gone");

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([live]);
  });

  it("warns about a frame it cannot read and stays connected", () => {
    client.connect();
    sockets.newest().open();

    sockets.newest().deliver("this is not a frame");

    expect(warned).toHaveBeenCalled();
    expect(store.getSnapshot().connection).toBe("live");
  });

  it("warns about a frame the server refused, which is a bug on this side", () => {
    client.connect();
    sockets.newest().open();

    sockets.newest().deliver({ type: "error", code: "rate_limited" });

    expect(warned.mock.calls.flat().join(" ")).toContain("rate_limited");
  });

  it("takes a pong as the sign of life it is, and changes nothing", () => {
    client.connect();
    sockets.newest().open();
    const before = store.getSnapshot();

    sockets.newest().deliver({ type: "pong" });

    expect(store.getSnapshot()).toBe(before);
  });
});
