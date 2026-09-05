import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MapRoom } from "@wolfchatter/shared/client";
import { describe, expect, it } from "vitest";
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

describe("RoomPanel", () => {
  it("invites the first click when no room is open", () => {
    render(<RoomPanel room={undefined} failedToOpen={false} />);

    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
  });

  it("titles the panel with the name the server gave the room", () => {
    render(<RoomPanel room={stored} failedToOpen={false} />);

    expect(screen.getByRole("heading", { name: "Chatroom 7" })).toBeInTheDocument();
  });

  it("says a room is opening rather than guessing the number it will be given", () => {
    render(<RoomPanel room={pending} failedToOpen={false} />);

    expect(screen.getByRole("heading", { name: "Opening the chatroom" })).toBeInTheDocument();
    expect(screen.queryByText(/Chatroom/)).not.toBeInTheDocument();
  });

  it("announces a creation that failed, in place of the room that never opened", () => {
    render(<RoomPanel room={undefined} failedToOpen={true} />);

    expect(screen.getByRole("alert")).toHaveTextContent("could not be opened");
    expect(screen.queryByText("Click on the map to start a chat")).not.toBeInTheDocument();
  });

  it("opens the sheet when the room is expanded, and closes it again", async () => {
    const user = userEvent.setup();
    render(<RoomPanel room={stored} failedToOpen={false} />);
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

  it("offers nothing to expand when there is no room, so the peek is the whole panel", () => {
    render(<RoomPanel room={undefined} failedToOpen={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
