import { randomUUID } from "node:crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Message } from "@wolfchatter/shared/schema";
import { describe, expect, it } from "vitest";
import { MessageList } from "../../src/messages/message-list.tsx";

const roomId = randomUUID();

const message = (overrides: Partial<Message> = {}): Message => ({
  id: randomUUID(),
  roomId,
  username: "ana",
  body: "hello",
  createdAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

/** jsdom lays nothing out, so the box a reader is looking through is stated outright. */
type ScrollBox = { scrollTop: number; scrollHeight: number; clientHeight: number };

function measure(list: HTMLElement, { scrollTop, scrollHeight, clientHeight }: ScrollBox) {
  Object.defineProperty(list, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(list, "clientHeight", { value: clientHeight, configurable: true });
  list.scrollTop = scrollTop;
  fireEvent.scroll(list);
}

describe("MessageList", () => {
  it("invites the first message when the room has none", () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByText("No messages here yet. Write the first one.")).toBeInTheDocument();
  });

  it("names the list before there is anything in it, so it can be announced", () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByRole("log", { name: "Chatroom messages" })).toBeInTheDocument();
  });

  it("shows who wrote each message and what they wrote", () => {
    render(<MessageList messages={[message({ username: "ana", body: "first light" })]} />);

    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("first light")).toBeInTheDocument();
  });

  it("stamps each message with a machine-readable time and a readable one", () => {
    render(<MessageList messages={[message({ createdAt: "2017-02-01T13:45:00.000Z" })]} />);
    const stamp = screen.getByText(/2017/);

    expect(stamp.tagName).toBe("TIME");
    expect(stamp).toHaveAttribute("dateTime", "2017-02-01T13:45:00.000Z");
  });

  it("keeps the order the server sent, rather than the order the clocks read", () => {
    render(
      <MessageList
        messages={[
          message({ body: "written first", createdAt: "2026-09-05T10:00:02.000Z" }),
          message({ body: "written second", createdAt: "2026-09-05T10:00:01.000Z" }),
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("written first"),
      expect.stringContaining("written second"),
    ]);
  });

  it("drops the reader to the newest message when one arrives", () => {
    const held = message({ body: "held" });
    const { rerender } = render(<MessageList messages={[held]} />);
    const list = screen.getByRole("log");
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });

    rerender(<MessageList messages={[held, message({ body: "arrived" })]} />);

    expect(list.scrollTop).toBe(1000);
  });

  it("leaves a reader who scrolled up where they were", () => {
    const held = message({ body: "held" });
    const { rerender } = render(<MessageList messages={[held]} />);
    const list = screen.getByRole("log");
    measure(list, { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });

    rerender(<MessageList messages={[held, message({ body: "arrived" })]} />);

    expect(list.scrollTop).toBe(100);
  });

  it("follows the newest message again once the reader scrolls back down", () => {
    const held = message({ body: "held" });
    const { rerender } = render(<MessageList messages={[held]} />);
    const list = screen.getByRole("log");
    measure(list, { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });
    measure(list, { scrollTop: 800, scrollHeight: 1000, clientHeight: 200 });

    rerender(<MessageList messages={[held, message({ body: "arrived" })]} />);

    expect(list.scrollTop).toBe(1000);
  });
});
