import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message, Room } from "@wolfchatter/shared/schema";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { leafletTestbed } from "./support/react-leaflet.tsx";
import { type StubbedSockets, stubWebSocket } from "./support/socket.ts";

vi.mock("react-leaflet", async () => (await import("./support/react-leaflet.tsx")).mockReactLeaflet());

const cluj = { lat: 46.7712, lng: 23.6236 };

const room = (overrides: Partial<Room> = {}): Room => ({
  id: randomUUID(),
  name: "Chatroom 1",
  ...cluj,
  createdAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

/**
 * The rooms already stored, then a name for each room the test goes on to open; a click
 * with no name left is a server that refused. The id is echoed back rather than invented,
 * because that is the contract the real endpoint keeps and the whole point of minting it
 * on this side.
 */
function serve(stored: readonly Room[], ...names: string[]): { opened: string[]; posted: Message[] } {
  const unnamed = [...names];
  const opened: string[] = [];
  const posted: Message[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, request?: RequestInit) => {
      const path = String(url);

      if (path.endsWith("/messages")) {
        const roomId = String(path.split("/").at(-2));
        if (request?.method !== "POST") {
          return Response.json(posted.filter((message) => message.roomId === roomId));
        }

        const written = JSON.parse(String(request.body)) as Omit<Message, "roomId" | "createdAt">;
        const message = { ...written, roomId, createdAt: "2026-09-05T10:00:00.000Z" };
        posted.push(message);
        return Response.json(message, { status: 201 });
      }

      if (request?.method !== "POST") return Response.json(stored);

      const point = JSON.parse(String(request.body)) as { id: string; lat: number; lng: number };
      opened.push(point.id);
      const name = unnamed.shift();
      if (name === undefined) return Response.json({ error: { code: "internal_error" } }, { status: 500 });
      return Response.json({ ...point, name, createdAt: "2026-09-05T10:00:00.000Z" }, { status: 201 });
    }),
  );

  return { opened, posted };
}

/**
 * Synchronous on purpose: React is flushed, but the request is not awaited, so what the
 * assertions see afterwards is the map as it looks before any server has answered.
 */
function tapMap() {
  act(() => {
    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 90 });
    leafletTestbed.clickMap(cluj);
  });
}

function renderApp() {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

let sockets: StubbedSockets;

beforeEach(() => {
  leafletTestbed.reset();
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  sockets = stubWebSocket();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("invites the first click before any room exists", async () => {
    serve([]);

    renderApp();

    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByTestId("marker")).toHaveLength(0));
  });

  it("shows the rooms that were already stored, so a reload keeps the map", async () => {
    serve([room({ name: "Chatroom 1" }), room({ name: "Chatroom 2", lat: 38.7, lng: -9.1 })]);

    renderApp();

    expect(await screen.findByRole("button", { name: "Chatroom 2" })).toBeInTheDocument();
  });

  it("drops a pin and opens its panel on the click, before the server has answered", async () => {
    serve([], "Chatroom 3");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();

    // The panel is the room's before the round trip, because NFR-1 gives it 100 ms; the name
    // is the only part that waits, and the composer with it, since the room can still fail.
    expect(screen.getByRole("button", { name: "New chatroom" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opening the chatroom" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("write message here")).toBeDisabled();

    expect(await screen.findByRole("heading", { name: "Chatroom 3" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("write message here")).toBeEnabled();
  });

  it("names the open room in the address, so the link can be shared", async () => {
    const server = serve([], "Chatroom 3");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();

    await screen.findByRole("heading", { name: "Chatroom 3" });
    expect(window.location.search).toBe(`?room=${server.opened[0]}`);
  });

  it("opens the room the address arrived with", async () => {
    const deepLinked = room({ name: "Chatroom 2" });
    serve([room({ name: "Chatroom 1" }), deepLinked]);
    window.history.replaceState(null, "", `/?room=${deepLinked.id}`);

    renderApp();

    expect(await screen.findByRole("heading", { name: "Chatroom 2" })).toBeInTheDocument();
  });

  it("offers a way past the pins, which a keyboard would otherwise walk one by one", async () => {
    serve([room({ name: "Chatroom 1" })]);

    renderApp();
    await screen.findByRole("button", { name: "Chatroom 1" });

    expect(screen.getByRole("link", { name: "Skip to the chatroom" })).toHaveAttribute("href", "#chatroom");
    // A section is not focusable on its own, so the jump would land on nothing without this.
    const panel = screen.getByRole("region", { name: "Chatroom" });
    expect(panel).toHaveAttribute("id", "chatroom");
    expect(panel).toHaveAttribute("tabindex", "-1");
  });

  it("lets go of the room on Escape, and the address lets go with it", async () => {
    const user = userEvent.setup();
    const deepLinked = room({ name: "Chatroom 2" });
    serve([deepLinked]);
    window.history.replaceState(null, "", `/?room=${deepLinked.id}`);

    renderApp();
    await screen.findByRole("heading", { name: "Chatroom 2" });

    await user.keyboard("{Escape}");

    expect(window.location.search).toBe("");
    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
  });

  it("switches the panel to the room whose marker was clicked", async () => {
    const user = userEvent.setup();
    serve([room({ name: "Chatroom 1" }), room({ name: "Chatroom 2", lat: 38.7, lng: -9.1 })]);

    renderApp();
    await user.click(await screen.findByRole("button", { name: "Chatroom 2" }));

    expect(screen.getByRole("heading", { name: "Chatroom 2" })).toBeInTheDocument();
  });

  it("opens one room for a double click on the same spot", async () => {
    serve([], "Chatroom 1", "Chatroom 2");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 40 });
    leafletTestbed.clickMap(cluj);
    leafletTestbed.pointer("pointerdown", { x: 121, y: 201, at: 150 });
    leafletTestbed.pointer("pointerup", { x: 121, y: 201, at: 190 });
    leafletTestbed.clickMap(cluj);

    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(1));
  });

  it("takes the pin back off the map when the room cannot be opened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serve([]);

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be opened");
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
  });

  it("titles the room opened after one that was refused, so a failure ends with that room", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    serve([room({ name: "Chatroom 1" })]);

    renderApp();
    await screen.findByRole("button", { name: "Chatroom 1" });
    tapMap();
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Chatroom 1" }));

    // The heading is also what FR-9 moves the keyboard to, so the refusal would cost both.
    expect(await screen.findByRole("heading", { name: "Chatroom 1" })).toHaveFocus();
  });

  it("keeps the message that was written in the room it was written in", async () => {
    const user = userEvent.setup();
    const server = serve([], "Chatroom 3");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();
    await screen.findByRole("heading", { name: "Chatroom 3" });

    await user.type(screen.getByPlaceholderText("write your user name here"), "ana");
    await user.type(screen.getByPlaceholderText("write message here"), "first light{Enter}");

    expect(await screen.findByText("first light")).toBeInTheDocument();
    await waitFor(() => expect(server.posted).toHaveLength(1));
    expect(server.posted[0]).toMatchObject({ username: "ana", body: "first light" });
  });

  it("shows what was written before, which is what a reload and a second browser see", async () => {
    const user = userEvent.setup();
    const stored = room({ name: "Chatroom 1" });
    const server = serve([stored]);
    server.posted.push({
      id: randomUUID(),
      roomId: stored.id,
      username: "bogdan",
      body: "written in another browser",
      createdAt: "2026-09-05T10:00:00.000Z",
    });

    renderApp();
    await user.click(await screen.findByRole("button", { name: "Chatroom 1" }));

    // In the list, and again in the peek the collapsed sheet shows.
    expect(await screen.findAllByText("written in another browser")).toHaveLength(2);
  });

  it("puts a room somebody else opened on the map, with no reload", async () => {
    serve([]);
    renderApp();
    await screen.findByText("Click on the map to start a chat");

    const elsewhere = room({ name: "Chatroom 4", lat: 38.7, lng: -9.1 });
    await act(async () => {
      sockets.deliver({ type: "room:created", room: elsewhere });
    });

    expect(screen.getByRole("button", { name: "Chatroom 4" })).toBeInTheDocument();
  });

  it("shows a message posted in another browser without being asked for it", async () => {
    const user = userEvent.setup();
    const stored = room({ name: "Chatroom 1" });
    serve([stored]);
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Chatroom 1" }));
    await waitFor(() => expect(sockets.sent).toContainEqual({ type: "subscribe", roomId: stored.id }));

    await act(async () => {
      sockets.deliver({
        type: "message:created",
        message: {
          id: randomUUID(),
          roomId: stored.id,
          username: "bogdan",
          body: "said from the other browser",
          createdAt: "2026-09-05T10:00:00.000Z",
        },
      });
    });

    // In the list, and again in the peek the collapsed sheet shows.
    expect(screen.getAllByText("said from the other browser")).toHaveLength(2);
  });

  it("leaves no socket open behind a view that is gone", async () => {
    serve([]);
    const { unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText("Live");

    unmount();

    expect(sockets.closed).toBe(sockets.opened);
  });

  it("says the connection is live once the socket is up", async () => {
    serve([]);

    renderApp();

    expect(await screen.findByText("Live")).toBeInTheDocument();
  });

  it("offers the name this browser last posted under when the next room opens", async () => {
    const user = userEvent.setup();
    const second = room({ name: "Chatroom 2", lat: 38.7, lng: -9.1 });
    serve([room({ name: "Chatroom 1" }), second]);

    renderApp();
    await user.click(await screen.findByRole("button", { name: "Chatroom 1" }));
    await user.type(screen.getByPlaceholderText("write your user name here"), "ana");
    await user.type(screen.getByPlaceholderText("write message here"), "first light{Enter}");
    await screen.findAllByText("first light");

    await user.click(screen.getByRole("button", { name: "Chatroom 2" }));

    expect(screen.getByPlaceholderText("write your user name here")).toHaveValue("ana");
  });

  it("opens the sheet for a room the map was tapped to make, because that tap came to write", async () => {
    serve([], "Chatroom 3");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();

    expect(await screen.findByRole("button", { name: "Collapse the chatroom" })).toBeInTheDocument();
  });

  it("leaves the sheet a peek for a marker, because that tap came to look", async () => {
    const user = userEvent.setup();
    serve([room({ name: "Chatroom 1" })]);

    renderApp();
    await user.click(await screen.findByRole("button", { name: "Chatroom 1" }));

    expect(screen.getByRole("button", { name: "Expand the chatroom" })).toBeInTheDocument();
  });

  it("leaves the sheet a peek when a pin comes back to a room the map made, because that tap came to look", async () => {
    const user = userEvent.setup();
    serve([room({ name: "Chatroom 1", lat: 38.7, lng: -9.1 })], "Chatroom 3");

    renderApp();
    await screen.findByRole("button", { name: "Chatroom 1" });
    tapMap();
    await screen.findByRole("heading", { name: "Chatroom 3" });

    await user.click(screen.getByRole("button", { name: "Chatroom 1" }));
    await user.click(screen.getByRole("button", { name: "Chatroom 3" }));

    expect(screen.getByRole("button", { name: "Expand the chatroom" })).toBeInTheDocument();
  });

  it("leaves the sheet a peek when the back button returns to a room that was closed", async () => {
    const user = userEvent.setup();
    serve([], "Chatroom 3");

    renderApp();
    await screen.findByText("Click on the map to start a chat");
    tapMap();
    await screen.findByRole("heading", { name: "Chatroom 3" });

    await user.keyboard("{Escape}");
    await screen.findByText("Click on the map to start a chat");
    window.history.back();

    expect(await screen.findByRole("button", { name: "Expand the chatroom" })).toBeInTheDocument();
  });

  it("says so, and keeps the map, when the stored rooms cannot be loaded", async () => {
    const complain = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 500 })),
    );

    renderApp();

    await waitFor(() => expect(complain).toHaveBeenCalled());
    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
  });
});
