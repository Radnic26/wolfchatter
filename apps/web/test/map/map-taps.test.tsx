import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapTaps } from "../../src/map/map-taps.tsx";
import { leafletTestbed } from "../support/react-leaflet.tsx";

vi.mock("react-leaflet", async () => (await import("../support/react-leaflet.tsx")).mockReactLeaflet());

const cluj = { lat: 46.7712, lng: 23.6236 };

beforeEach(() => {
  leafletTestbed.reset();
});

describe("MapTaps", () => {
  it("opens a room where the map was tapped", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 90 });
    leafletTestbed.clickMap(cluj);

    // Leaflet folds every point through modular arithmetic, so one already in range comes
    // back a nanometre from where it went in.
    expect(onTap).toHaveBeenCalledWith(
      expect.objectContaining({ lat: cluj.lat, lng: expect.closeTo(cluj.lng, 10) }),
    );
  });

  it("folds a tap past the 180th meridian back onto the primary copy of the world", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 90 });
    leafletTestbed.clickMap({ lat: cluj.lat, lng: 200 });

    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ lat: cluj.lat, lng: -160 }));
  });

  it("opens no room when the gesture was a pan across the map", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 260, y: 240, at: 220 });
    leafletTestbed.clickMap(cluj);

    expect(onTap).not.toHaveBeenCalled();
  });

  it("opens a second room for a deliberate second click, well after the double-click window", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 40 });
    leafletTestbed.clickMap(cluj);
    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 900 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 940 });
    leafletTestbed.clickMap(cluj);

    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("opens one room for a double click, and opens it on the first of the two", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 40 });
    leafletTestbed.clickMap(cluj);
    leafletTestbed.pointer("pointerdown", { x: 121, y: 201, at: 150 });
    leafletTestbed.pointer("pointerup", { x: 121, y: 201, at: 190 });
    leafletTestbed.clickMap(cluj);

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("opens no room for a click Leaflet reports without a gesture behind it", () => {
    const onTap = vi.fn();
    render(<MapTaps onTap={onTap} />);

    leafletTestbed.clickMap(cluj);

    expect(onTap).not.toHaveBeenCalled();
  });

  it("stops listening to the map once it is gone", () => {
    const onTap = vi.fn();
    const { unmount } = render(<MapTaps onTap={onTap} />);

    unmount();
    leafletTestbed.pointer("pointerdown", { x: 120, y: 200, at: 0 });
    leafletTestbed.pointer("pointerup", { x: 120, y: 200, at: 90 });
    leafletTestbed.clickMap(cluj);

    expect(onTap).not.toHaveBeenCalled();
  });
});
