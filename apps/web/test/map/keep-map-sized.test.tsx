import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeepMapSized } from "../../src/map/keep-map-sized.tsx";
import { leafletTestbed } from "../support/react-leaflet.tsx";
import { observedElementCount, resizeEverything } from "../support/resize-observer.ts";

vi.mock("react-leaflet", async () => (await import("../support/react-leaflet.tsx")).mockReactLeaflet());

beforeEach(() => {
  leafletTestbed.reset();
});

describe("KeepMapSized", () => {
  it("tells Leaflet to re-measure when its box changes, or the new strip stays blank", () => {
    render(<KeepMapSized />);

    resizeEverything();

    expect(leafletTestbed.invalidateSize).toHaveBeenCalled();
  });

  it("re-measures without animating, because a collapsing URL bar sends a run of resizes", () => {
    render(<KeepMapSized />);

    resizeEverything();

    expect(leafletTestbed.invalidateSize).toHaveBeenCalledWith(false);
  });

  it("re-measures again on every change, not only on the first", () => {
    render(<KeepMapSized />);

    resizeEverything();
    resizeEverything();

    expect(leafletTestbed.invalidateSize).toHaveBeenCalledTimes(2);
  });

  it("stops watching when the map goes, so nothing is measured after it is gone", () => {
    const { unmount } = render(<KeepMapSized />);
    expect(observedElementCount()).toBe(1);

    unmount();

    expect(observedElementCount()).toBe(0);
  });
});
