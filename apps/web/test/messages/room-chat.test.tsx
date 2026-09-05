import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ChatStore, createChatStore, type MapRoom } from "@wolfchatter/shared/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomChat } from "../../src/messages/room-chat.tsx";
import { useRoomMessages } from "../../src/messages/use-chat-store.ts";

const room: MapRoom = {
  status: "stored",
  id: randomUUID(),
  name: "Chatroom 7",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
};

/** What the panel does around the chat: hand it the room's messages as the store publishes them. */
function Chatting({ store }: { store: ChatStore }) {
  return <RoomChat store={store} room={room} messages={useRoomMessages(store, room.id)} />;
}

type Posted = { id: string; username: string; body: string };

/**
 * The hour the server stamps a message with, written as local parts and sent as the instant
 * they name. What the list renders is then the same string on any machine, where a literal
 * `Z` would read as one hour here and another on a runner set to UTC.
 */
const acceptedAt = new Date(2026, 8, 5, 12, 0);
const acceptedAtReads = "05/09/2026 12:00";

/**
 * The history, and then a hold on the post: the answer is released by the test, so what the
 * assertions see in between is the room as it looks while the message is still in flight.
 */
function serve() {
  let release: (posted: Posted) => void = () => {};
  const held = new Promise<Posted>((resolve) => {
    release = resolve;
  });
  const server: { release: typeof release; received?: Posted } = { release: (posted) => release(posted) };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, request?: RequestInit) => {
      if (request?.method !== "POST") return Response.json([]);

      const posted = JSON.parse(String(request.body)) as Posted;
      server.received = posted;
      const answer = await held;
      return Response.json(
        { ...answer, id: posted.id, roomId: room.id, createdAt: acceptedAt.toISOString() },
        { status: 201 },
      );
    }),
  );

  return server;
}

let store: ChatStore;

async function write(user: ReturnType<typeof userEvent.setup>, body: string) {
  await user.type(screen.getByPlaceholderText("write your user name here"), "ana");
  await user.type(screen.getByPlaceholderText("write message here"), body);
  await user.click(screen.getByRole("button", { name: "Submit" }));
}

beforeEach(() => {
  store = createChatStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RoomChat", () => {
  it("shows the message the moment it is written, before the server has stored it", async () => {
    const user = userEvent.setup();
    const server = serve();
    render(<Chatting store={store} />);

    await write(user, "hello");

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(store.getSnapshot().messagesByRoom.get(room.id)).toHaveLength(0);

    // Released inside the test: an answer that lands after it would run against the next one.
    server.release({ id: "", username: "ana", body: "hello" });
    await waitFor(() => expect(store.getSnapshot().messagesByRoom.get(room.id)).toHaveLength(1));
  });

  it("keeps one copy of the message when the server echoes it back under the same id", async () => {
    const user = userEvent.setup();
    const server = serve();
    render(<Chatting store={store} />);
    await write(user, "hello");

    server.release({ id: "", username: "ana", body: "hello" });

    await waitFor(() => expect(store.getSnapshot().messagesByRoom.get(room.id)).toHaveLength(1));
    expect(screen.getAllByText("hello")).toHaveLength(1);
  });

  it("shows one copy when the message reaches the room while it is still being sent", async () => {
    const user = userEvent.setup();
    const server = serve();
    render(<Chatting store={store} />);
    await write(user, "hello");

    // The room learns about the message from somewhere else — the socket, once there is one —
    // before the answer to this post has arrived. It is the same message, under the same id.
    const sent = server.received;
    if (sent === undefined) throw new Error("the message was never posted");
    act(() => {
      store.addMessage({ ...sent, roomId: room.id, createdAt: acceptedAt.toISOString() });
    });

    expect(screen.getAllByText("hello")).toHaveLength(1);

    server.release({ id: "", username: "ana", body: "hello" });
    await waitFor(() => expect(store.getSnapshot().messagesByRoom.get(room.id)).toHaveLength(1));
  });

  it("shows the server's timestamp once it has one, not the sender's own clock", async () => {
    const user = userEvent.setup();
    const server = serve();
    render(<Chatting store={store} />);
    await write(user, "hello");

    server.release({ id: "", username: "ana", body: "hello" });

    expect(await screen.findByText(acceptedAtReads)).toBeInTheDocument();
  });

  it("takes the message back off the list when it could not be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, request?: RequestInit) =>
        request?.method === "POST"
          ? Response.json({ error: { code: "internal_error", requestId: "abc" } }, { status: 500 })
          : Response.json([]),
      ),
    );
    render(<Chatting store={store} />);

    await write(user, "hello");

    expect(await screen.findByText("That message was not sent. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });
});
