import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";

describe("App", () => {
  it("shows the empty-state panel before any room exists", () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(screen.getByText("Click on the map to start a chat")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Map" })).toBeInTheDocument();
  });
});
