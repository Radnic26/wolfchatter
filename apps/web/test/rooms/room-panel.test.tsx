import { randomUUID } from "node:crypto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ChatStore, createChatStore, type MapRoom } from "@wolfchatter/shared/client";
import type { Message } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomPanel } from "../../src/rooms/room-panel.tsx";

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

/** The room reads its history when it opens, so what the server holds is what the panel shows. */
function serveMessages(history: readonly Message[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(history)),
  );
}

function showPanel(room: MapRoom | undefined, openExpanded = false) {
  render(<RoomPanel store={store} room={room} failedToOpen={false} openExpanded={openExpanded} />);
}

beforeEach(() => {
  store = createChatStore();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json([])),
  );
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
    render(<RoomPanel store={store} room={undefined} failedToOpen={true} openExpanded={false} />);

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

  it("reads the room's history when it opens", async () => {
    serveMessages([message("what was said before")]);

    showPanel(stored);

    expect(await screen.findAllByText("what was said before")).not.toHaveLength(0);
  });

  it("asks for no history for a room the server has not answered for yet", async () => {
    const fetching = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetching);

    showPanel(pending);

    await waitFor(() => expect(screen.getByRole("log")).toBeInTheDocument());
    expect(fetching).not.toHaveBeenCalled();
  });

  it("says so when the history cannot be read, rather than showing an empty room", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 500 })),
    );

    showPanel(stored);

    expect(await screen.findByRole("alert")).toHaveTextContent("earlier messages could not be loaded");
  });
});
