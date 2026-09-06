import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ChatStore, createChatStore, type MapRoom } from "@wolfchatter/shared/client";
import type { Message } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomPanel } from "../../src/rooms/room-panel.tsx";
import { type ChatClientDouble, fakeChatClient } from "../support/chat-client.ts";

const stored: MapRoom = {
  status: "stored",
  id: randomUUID(),
  name: "Chatroom 7",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
};

const pending: MapRoom = { status: "pending", id: randomUUID(), lat: 1, lng: 2 };

const message = (body: string, username = "ana"): Message => ({
  id: randomUUID(),
  roomId: stored.id,
  username,
  body,
  createdAt: "2026-09-05T10:00:00.000Z",
});

let store: ChatStore;
let client: ChatClientDouble;
let closed: () => void;

/** Following a room is what loads it, so this is the history the socket client answers with. */
function serveMessages(history: readonly Message[]): void {
  client.answerSubscribe = async (roomId) => store.setMessages(roomId, history);
}

function showPanel(room: MapRoom | undefined, openExpanded = false) {
  render(
    <RoomPanel
      store={store}
      client={client}
      room={room}
      failedToOpen={false}
      openExpanded={openExpanded}
      onClose={closed}
    />,
  );
}

beforeEach(() => {
  store = createChatStore();
  client = fakeChatClient();
  closed = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomPanel", () => {
  it("invites the first click when no room is open", () => {
    showPanel(undefined);

    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
  });

  it("titles the panel with the name the server gave the room", () => {
    showPanel(stored);

    expect(screen.getByRole("heading", { name: "Chatroom 7" })).toBeInTheDocument();
  });

  it("says a room is opening rather than guessing the number it will be given", () => {
    showPanel(pending);

    expect(screen.getByRole("heading", { name: "Opening the chatroom" })).toBeInTheDocument();
    expect(screen.queryByText(/Chatroom/)).not.toBeInTheDocument();
  });

  it("announces a creation that failed, in place of the room that never opened", () => {
    render(
      <RoomPanel
        store={store}
        client={client}
        room={undefined}
        failedToOpen={true}
        openExpanded={false}
        onClose={closed}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("could not be opened");
    expect(screen.queryByText("Click on the map to start a chat")).not.toBeInTheDocument();
  });

  it("opens the sheet when the room is expanded, and closes it again", async () => {
    const user = userEvent.setup();
    showPanel(stored);
    const toggle = screen.getByRole("button", { name: "Expand the chatroom" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Collapse the chatroom" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Collapse the chatroom" }));

    expect(screen.getByRole("button", { name: "Expand the chatroom" })).toBeInTheDocument();
  });

  it("opens already expanded for the room a tap on the map has just made", () => {
    showPanel(stored, true);

    expect(screen.getByRole("button", { name: "Collapse the chatroom" })).toBeInTheDocument();
  });

  it("stands the collapsed sheet off the bottom of the screen without shortening the peek", () => {
    showPanel(stored);

    // Tailwind's own output is not in jsdom, so the class is where the height can be read: it
    // is the sheet that grows by the safe-area strip, leaving the peek row its full height.
    expect(screen.getByRole("region", { name: "Chatroom" })).toHaveClass("h-peek-safe");
  });

  it("offers nothing to expand when there is no room, so the peek is the whole panel", () => {
    showPanel(undefined);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("previews the last thing said, so the collapsed sheet is more than a title", async () => {
    serveMessages([message("older"), message("the newest one", "bogdan")]);

    showPanel(stored);

    // Once in the list and once in the peek, where anything older appears only in the list.
    expect(await screen.findAllByText("the newest one")).toHaveLength(2);
    expect(screen.getAllByText("older")).toHaveLength(1);
  });

  it("drops the peek's preview once the sheet is open, because the list is showing it", async () => {
    const user = userEvent.setup();
    serveMessages([message("the newest one", "bogdan")]);
    showPanel(stored);
    await screen.findAllByText("the newest one");

    await user.click(screen.getByRole("button", { name: "Expand the chatroom" }));

    expect(screen.getAllByText("the newest one")).toHaveLength(1);
  });

  it("previews nothing for a room nobody has written in", () => {
    showPanel(stored);

    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(screen.getByText("No messages here yet. Write the first one.")).toBeInTheDocument();
  });

  it("follows the room and reads its history when it opens", async () => {
    serveMessages([message("what was said before")]);

    showPanel(stored);

    expect(await screen.findAllByText("what was said before")).not.toHaveLength(0);
    expect(client.subscribed).toEqual([stored.id]);
  });

  it("stops following a room the panel has moved off", async () => {
    const { unmount } = render(
      <RoomPanel
        store={store}
        client={client}
        room={stored}
        failedToOpen={false}
        openExpanded={false}
        onClose={closed}
      />,
    );
    await waitFor(() => expect(client.subscribed).toEqual([stored.id]));

    unmount();

    expect(client.unsubscribed).toEqual([stored.id]);
  });

  it("follows nothing for a room the server has not answered for yet", async () => {
    showPanel(pending);

    await waitFor(() => expect(screen.getByRole("log")).toBeInTheDocument());
    expect(client.subscribed).toEqual([]);
  });

  it("says so when the history cannot be read, rather than showing an empty room", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    client.answerSubscribe = async () => {
      throw new Error("the server answered 500");
    };

    showPanel(stored);

    expect(await screen.findByRole("alert")).toHaveTextContent("earlier messages could not be loaded");
  });
  it("puts the keyboard on the title of the room that just opened", () => {
    showPanel(stored);

    expect(screen.getByRole("heading", { name: "Chatroom 7" })).toHaveFocus();
  });

  it("announces a room whose name has not arrived, rather than an empty title", () => {
    showPanel(pending);

    expect(screen.getByRole("heading", { name: "Opening the chatroom" })).toHaveFocus();
  });

  it("leaves the keyboard where it is when a message arrives, so nobody is interrupted mid-word", async () => {
    const user = userEvent.setup();
    showPanel(stored);
    const writing = screen.getByPlaceholderText("write message here");
    await user.click(writing);

    act(() => store.addMessage(message("someone else wrote this")));

    // Once in the list and once in the collapsed sheet's preview.
    expect(await screen.findAllByText("someone else wrote this")).toHaveLength(2);
    expect(writing).toHaveFocus();
  });

  it("closes the room on Escape, which is the only way out without a mouse", async () => {
    const user = userEvent.setup();
    showPanel(stored);

    await user.keyboard("{Escape}");

    expect(closed).toHaveBeenCalled();
  });

  it("puts the sheet down before it closes the room, where there is a sheet to put down", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    showPanel(stored, true);

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Expand the chatroom" })).toBeInTheDocument();
    expect(closed).not.toHaveBeenCalled();
    // What the sheet just hid may have been holding the keyboard, and a browser drops the
    // focus of anything it hides, so the second Escape would land on nothing.
    expect(screen.getByRole("region", { name: "Chatroom" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(closed).toHaveBeenCalled();
  });

  it("closes the room on the first Escape where there is no sheet to put down", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    showPanel(stored, true);

    await user.keyboard("{Escape}");

    expect(closed).toHaveBeenCalled();
  });

  it("ignores the keys that are not Escape", async () => {
    const user = userEvent.setup();
    showPanel(stored);

    await user.keyboard("{Enter}");

    expect(closed).not.toHaveBeenCalled();
  });
});
