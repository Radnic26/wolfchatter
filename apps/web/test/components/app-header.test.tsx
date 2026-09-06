import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppHeader } from "../../src/components/app-header.tsx";

describe("AppHeader", () => {
  it("names the app with the wordmark, readable when the image does not load", () => {
    render(<AppHeader connection="live" />);

    expect(screen.getByAltText("Wolfchatter")).toHaveAttribute("src", "/brand/wordmark-light.svg");
  });

  it("carries the dark wordmark for a dark theme, so neither is a hidden second copy", () => {
    const { container } = render(<AppHeader connection="live" />);

    const alternative = container.querySelector("source");
    expect(alternative).toHaveAttribute("srcset", "/brand/wordmark-dark.svg");
    expect(alternative).toHaveAttribute("media", "(prefers-color-scheme: dark)");
  });

  it("keeps the wordmark clear of the notch when the phone is on its side", () => {
    render(<AppHeader connection="live" />);

    // Tailwind's own output is not in jsdom, so the class is where the rule can be read: the
    // padding is the larger of the one the layout asks for and the one the screen does.
    const row = screen.getByAltText("Wolfchatter").closest("div");

    expect(row).toHaveClass(
      "pl-[max(1rem,env(safe-area-inset-left))]",
      "pr-[max(1rem,env(safe-area-inset-right))]",
    );
  });

  it("carries the connection's state, which is the app's and not any one room's", () => {
    render(<AppHeader connection="reconnecting" />);

    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
  });
});
