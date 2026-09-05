import { afterEach, describe, expect, it } from "vitest";
import { focusTheMap } from "../../src/map/focus-the-map.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusTheMap", () => {
  it("puts the keyboard on the container Leaflet made focusable", () => {
    const map = document.createElement("div");
    map.className = "leaflet-container";
    map.tabIndex = 0;
    document.body.append(map);

    focusTheMap();

    expect(map).toHaveFocus();
  });

  it("does nothing at all when there is no map on the page", () => {
    expect(() => focusTheMap()).not.toThrow();
  });
});
