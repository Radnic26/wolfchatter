import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionIndicator } from "../../src/components/connection-indicator.tsx";

describe("ConnectionIndicator", () => {
  it.each([
    ["connecting", "Connecting…"],
    ["live", "Live"],
    ["reconnecting", "Reconnecting…"],
  ] as const)("says %s in words, not only in colour", (status, wording) => {
    render(<ConnectionIndicator status={status} />);

    expect(screen.getByRole("status")).toHaveTextContent(wording);
  });

  it("announces a change without stealing focus, because it interrupts nobody", () => {
    render(<ConnectionIndicator status="live" />);

    // `role="status"` is a polite live region: a screen reader reaches it after the sentence
    // it is on, which is what a connection notice deserves against an alert.
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("carries the broadcast mark for both themes, decoratively: the words carry the state", () => {
    const { container } = render(<ConnectionIndicator status="live" />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/brand/state-live-light.svg");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("source")).toHaveAttribute("srcset", "/brand/state-live-dark.svg");
  });

  it("dims the mark while there is nothing to be live about", () => {
    const { container } = render(<ConnectionIndicator status="reconnecting" />);

    expect(container.querySelector("picture")).toHaveClass("opacity-50");
  });

  it("leaves the mark at full strength once the connection carries", () => {
    const { container } = render(<ConnectionIndicator status="live" />);

    expect(container.querySelector("picture")).not.toHaveClass("opacity-50");
  });
});
