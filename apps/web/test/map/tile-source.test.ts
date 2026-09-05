import { describe, expect, it } from "vitest";
import { resolveTileSource } from "../../src/map/tile-source.ts";

describe("resolveTileSource", () => {
  it("draws the watercolour of the reference when nothing is configured", () => {
    const tiles = resolveTileSource({});

    expect(tiles.url).toBe("https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg");
    expect(tiles.attribution).toContain("Stadia Maps");
    expect(tiles.attribution).toContain("Stamen Design");
    expect(tiles.attribution).toContain("OpenStreetMap");
  });

  it("stops the watercolour at the zoom the archive was drawn to", () => {
    expect(resolveTileSource({}).maxZoom).toBe(16);
  });

  it("addresses its tiles over https, which an https deployment requires", () => {
    expect(resolveTileSource({}).url.startsWith("https://")).toBe(true);
  });

  it("takes the configured tile server, which is how a phone on the network gets a map", () => {
    const tiles = resolveTileSource({
      VITE_TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      VITE_TILE_ATTRIBUTION: "OpenStreetMap contributors",
    });

    expect(tiles.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tiles.attribution).toBe("OpenStreetMap contributors");
  });

  it("lets a configured tile server zoom past the watercolour archive's limit", () => {
    const tiles = resolveTileSource({
      VITE_TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      VITE_TILE_ATTRIBUTION: "OpenStreetMap contributors",
    });

    expect(tiles.maxZoom).toBe(19);
  });

  it("refuses tiles without their credit, which would draw them under Stadia's", () => {
    expect(() => resolveTileSource({ VITE_TILE_URL: "https://example.test/{z}/{x}/{y}.png" })).toThrow(
      /VITE_TILE_URL and VITE_TILE_ATTRIBUTION/,
    );
  });

  it("refuses a credit with no tiles behind it", () => {
    expect(() => resolveTileSource({ VITE_TILE_ATTRIBUTION: "Someone else" })).toThrow(
      /VITE_TILE_URL and VITE_TILE_ATTRIBUTION/,
    );
  });

  it("treats an empty variable as absent rather than as a tile server", () => {
    expect(() => resolveTileSource({ VITE_TILE_URL: "", VITE_TILE_ATTRIBUTION: "" })).toThrow(
      /Invalid tile configuration/,
    );
  });
});
