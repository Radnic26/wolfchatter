import { describe, expect, it } from "vitest";
import { defaultTileSource, offeredTileSources, openStreetMapTiles } from "../tile-source.ts";

describe("offeredTileSources", () => {
  it("offers the reference style first, so pressing Enter keeps the map of the brief", () => {
    expect(offeredTileSources[0]?.source).toBe("watercolor");
    expect(defaultTileSource).toBe("watercolor");
  });

  it("offers OpenStreetMap as the way out of Stadia's host rule", () => {
    const alternative = offeredTileSources.find((choice) => choice.source === "osm");

    expect(alternative?.detail).toContain("phone");
  });
});

describe("openStreetMapTiles", () => {
  it("addresses tiles over https, since a deployed app would block mixed content", () => {
    expect(openStreetMapTiles.url.startsWith("https://")).toBe(true);
    expect(openStreetMapTiles.url).toContain("{z}/{x}/{y}");
  });

  it("credits OpenStreetMap, which its licence requires", () => {
    expect(openStreetMapTiles.attribution).toContain("OpenStreetMap");
  });
});
