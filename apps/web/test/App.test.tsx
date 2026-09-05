import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Room } from "@wolfchatter/shared/schema";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { leafletTestbed } from "./support/react-leaflet.tsx";

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
function serve(stored: readonly Room[], ...names: string[]): { opened: string[] } {
  const unnamed = [...names];
  const opened: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, request?: RequestInit) => {
      if (request?.method !== "POST") return Response.json(stored);

      const point = JSON.parse(String(request.body)) as { id: string; lat: number; lng: number };
      opened.push(point.id);
      const name = unnamed.shift();
      if (name === undefined) return Response.json({ error: { code: "internal_error" } }, { status: 500 });
      return Response.json({ ...point, name, createdAt: "2026-09-05T10:00:00.000Z" }, { status: 201 });
    }),
  );

  return { opened };
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

beforeEach(() => {
  leafletTestbed.reset();
  window.history.replaceState(null, "", "/");
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

    expect(screen.getByRole("button", { name: "New chatroom" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Chatroom 3" })).toBeInTheDocument();
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
