import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "../../src/messages/message-composer.tsx";
import type { MessageDraft } from "../../src/messages/message-draft.ts";

function showComposer(
  { username = "", disabled = false }: { username?: string; disabled?: boolean } = {},
  onSend: (draft: MessageDraft) => Promise<void> = async () => {},
) {
  render(<MessageComposer username={username} disabled={disabled} onSend={onSend} />);

  return {
    user: userEvent.setup(),
    name: screen.getByPlaceholderText("write your user name here"),
    body: screen.getByPlaceholderText("write message here"),
    submit: screen.getByRole("button", { name: "Submit" }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MessageComposer", () => {
  it("labels both fields, so neither is a placeholder alone", () => {
    showComposer();

    expect(screen.getByLabelText("Your user name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toBeInTheDocument();
  });

  it("opens with the name this browser last posted under", () => {
    const { name } = showComposer({ username: "ana" });

    expect(name).toHaveValue("ana");
  });

  it("sends what was written when Submit is pressed", async () => {
    const onSend = vi.fn(async () => {});
    const { user, name, body, submit } = showComposer({}, onSend);

    await user.type(name, "ana");
    await user.type(body, "hello");
    await user.click(submit);

    expect(onSend).toHaveBeenCalledWith({ username: "ana", body: "hello" });
  });

  it("sends on Enter, without reaching for the button", async () => {
    const onSend = vi.fn(async () => {});
    const { user, name, body } = showComposer({}, onSend);

    await user.type(name, "ana");
    await user.type(body, "hello{Enter}");

    expect(onSend).toHaveBeenCalledWith({ username: "ana", body: "hello" });
  });

  it("sends what was typed without the spaces around it", async () => {
    const onSend = vi.fn(async () => {});
    const { user, name, body, submit } = showComposer({}, onSend);

    await user.type(name, "  ana  ");
    await user.type(body, "  hello  ");
    await user.click(submit);

    expect(onSend).toHaveBeenCalledWith({ username: "ana", body: "hello" });
  });

  it("never sends an empty message, and says why", async () => {
    const onSend = vi.fn(async () => {});
    const { user, name, submit } = showComposer({}, onSend);

    await user.type(name, "ana");
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("Write a message before sending.");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("never sends without a user name, and says why", async () => {
    const onSend = vi.fn(async () => {});
    const { user, body, submit } = showComposer({}, onSend);

    await user.type(body, "hello");
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("Write a user name before sending.");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("marks the field that was refused, so it is not only the message that says so", async () => {
    const { user, name, body, submit } = showComposer();

    await user.type(name, "ana");
    await user.click(submit);

    await waitFor(() => expect(body).toHaveAttribute("aria-invalid", "true"));
    expect(body).toHaveAccessibleDescription("Write a message before sending.");
    expect(name).toHaveAttribute("aria-invalid", "false");
  });

  it("empties the message once it has gone, and keeps the name for the next one", async () => {
    const { user, name, body, submit } = showComposer();

    await user.type(name, "ana");
    await user.type(body, "hello");
    await user.click(submit);

    await waitFor(() => expect(body).toHaveValue(""));
    expect(name).toHaveValue("ana");
  });

  it("keeps the words typed while the message was still on its way", async () => {
    let deliver = () => {};
    const inFlight = new Promise<void>((resolve) => {
      deliver = () => resolve();
    });
    const { user, name, body, submit } = showComposer({}, () => inFlight);

    await user.type(name, "ana");
    await user.type(body, "hello");
    await user.click(submit);
    await user.type(body, " again");
    await act(async () => deliver());

    expect(body).toHaveValue("hello again");
  });

  it("keeps the words that were not sent, so a failure costs nobody their message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user, name, body, submit } = showComposer({}, async () => {
      throw new Error("the network is gone");
    });

    await user.type(name, "ana");
    await user.type(body, "hello");
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("That message was not sent. Try again.");
    expect(body).toHaveValue("hello");
  });

  it("refuses to write into a room the server has not confirmed yet", () => {
    const { name, body, submit } = showComposer({ disabled: true });

    expect(name).toBeDisabled();
    expect(body).toBeDisabled();
    expect(submit).toBeDisabled();
  });
});
