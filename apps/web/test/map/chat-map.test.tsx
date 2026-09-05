import { randomUUID } from "node:crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MapRoom } from "@wolfchatter/shared/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMap } from "../../src/map/chat-map.tsx";
import { leafletTestbed } from "../support/react-leaflet.tsx";

vi.mock("react-leaflet", async () => (await import("../support/react-leaflet.tsx")).mockReactLeaflet());

const cluj: MapRoom = {
  status: "stored",
  id: randomUUID(),
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
};

const lisbon: MapRoom = { ...cluj, id: randomUUID(), name: "Chatroom 2", lat: 38.7223, lng: -9.1393 };

function renderMap(rooms: readonly MapRoom[], selectedRoomId: string | null, onSelectRoom = vi.fn()) {
  render(
    <ChatMap rooms={rooms} selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom} onTapMap={vi.fn()} />,
  );
  return onSelectRoom;
}

beforeEach(() => {
  leafletTestbed.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatMap", () => {
  it("credits the tiles it draws, which their licence requires", () => {
    renderMap([], null);

    const tiles = screen.getByTestId("tiles");
    expect(tiles.dataset.url).toMatch(/\{z\}\/\{x\}\/\{y\}/);
    expect(tiles.dataset.attribution).toMatch(/OpenStreetMap/);
    expect(tiles.dataset.maxZoom).toBe("16");
  });

  it("puts a marker on every room, where the room is", () => {
    renderMap([cluj, lisbon], null);

    expect(screen.getAllByTestId("marker").map((marker) => marker.dataset.position)).toEqual([
      "46.7712,23.6236",
      "38.7223,-9.1393",
    ]);
  });

  it("names each marker, so a room is reachable without seeing the map", () => {
    renderMap([cluj, { status: "pending", id: randomUUID(), lat: 1, lng: 2 }], null);

    expect(screen.getByRole("button", { name: "Chatroom 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chatroom" })).toBeInTheDocument();
  });

  it("renames the pin once the server has named the room, with no reload", () => {
    const opening: MapRoom = { status: "pending", id: cluj.id, lat: cluj.lat, lng: cluj.lng };
    const { rerender } = render(
      <ChatMap rooms={[opening]} selectedRoomId={opening.id} onSelectRoom={vi.fn()} onTapMap={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "New chatroom" })).toBeInTheDocument();

    rerender(<ChatMap rooms={[cluj]} selectedRoomId={cluj.id} onSelectRoom={vi.fn()} onTapMap={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Chatroom 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New chatroom" })).not.toBeInTheDocument();
  });

  it("draws the open room's marker in the accent, and the rest in ink", () => {
    renderMap([cluj, lisbon], lisbon.id);

    const [first, second] = screen.getAllByTestId("marker");
    expect(first?.dataset.icon).toContain("text-ink");
    expect(second?.dataset.icon).toContain("text-accent");
  });

  it("keeps the open room's marker above the others, so a click cannot miss it", () => {
    renderMap([cluj, lisbon], lisbon.id);

    const [first, second] = screen.getAllByTestId("marker");
    expect(first?.dataset.z).toBe("0");
    expect(second?.dataset.z).toBe("1000");
  });

  it("opens the room whose marker was clicked", async () => {
    const user = userEvent.setup();
    const onSelectRoom = renderMap([cluj, lisbon], null);

    await user.click(screen.getByRole("button", { name: "Chatroom 2" }));

    expect(onSelectRoom).toHaveBeenCalledWith(lisbon.id);
  });

  it("flies to a room the map is not showing, which is what a shared link needs", () => {
    leafletTestbed.visibleBounds = false;

    renderMap([lisbon], lisbon.id);

    expect(leafletTestbed.flyTo).toHaveBeenCalledWith([38.7223, -9.1393], 5);
  });

  it("leaves the map where it is for a room already on screen", () => {
    leafletTestbed.visibleBounds = true;

    renderMap([lisbon], lisbon.id);

    expect(leafletTestbed.flyTo).not.toHaveBeenCalled();
    expect(leafletTestbed.setView).not.toHaveBeenCalled();
  });

  it("moves the map without the flight when motion is unwelcome", () => {
    leafletTestbed.visibleBounds = false;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    renderMap([lisbon], lisbon.id);

    expect(leafletTestbed.setView).toHaveBeenCalledWith([38.7223, -9.1393], 5);
    expect(leafletTestbed.flyTo).not.toHaveBeenCalled();
  });

  it("stays where it is when no room is open", () => {
    leafletTestbed.visibleBounds = false;

    renderMap([cluj], null);

    expect(leafletTestbed.flyTo).not.toHaveBeenCalled();
  });
  it("opens the room of the pin the keyboard is on, which Leaflet leaves undone", async () => {
    const user = userEvent.setup();
    const onSelectRoom = renderMap([cluj, lisbon], null);
    screen.getByRole("button", { name: "Chatroom 2" }).focus();

    await user.keyboard("{Enter}");

    expect(onSelectRoom).toHaveBeenCalledWith(lisbon.id);
  });

  it("opens it on Space too, and keeps Space from scrolling the map away", () => {
    const onSelectRoom = renderMap([cluj], null);
    const pin = screen.getByRole("button", { name: "Chatroom 1" });

    const notScrolled = !fireEvent.keyDown(pin, { key: " " });

    expect(onSelectRoom).toHaveBeenCalledWith(cluj.id);
    expect(notScrolled).toBe(true);
  });

  it("leaves every other key to the map, which pans on the arrows", async () => {
    const user = userEvent.setup();
    const onSelectRoom = renderMap([cluj], null);
    screen.getByRole("button", { name: "Chatroom 1" }).focus();

    await user.keyboard("{ArrowRight}");

    expect(onSelectRoom).not.toHaveBeenCalled();
  });

  it("animates its own zoom and follows a pin that takes focus, by default", () => {
    renderMap([cluj], null);

    expect(screen.getByTestId("map").dataset.zoomAnimation).toBe("true");
    expect(screen.getByTestId("map").dataset.fadeAnimation).toBe("true");
    expect(screen.getByTestId("map").dataset.markerZoomAnimation).toBe("true");
    expect(screen.getByTestId("marker").dataset.autoPanOnFocus).toBe("true");
  });

  it("stops animating anything of its own when motion is unwelcome", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    renderMap([cluj], null);

    expect(screen.getByTestId("map").dataset.zoomAnimation).toBe("false");
    expect(screen.getByTestId("map").dataset.fadeAnimation).toBe("false");
    expect(screen.getByTestId("map").dataset.markerZoomAnimation).toBe("false");
    expect(screen.getByTestId("marker").dataset.autoPanOnFocus).toBe("false");
  });
});
