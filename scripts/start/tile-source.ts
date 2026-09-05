/**
 * Which tile server draws the map. Stadia serves the watercolour tiles of the reference
 * without a key on `localhost`, but answers 401 to every other host, so a phone reaching
 * the dev server by its address on the network sees an empty map. OpenStreetMap has no
 * such rule, which is why the choice is offered on the first run rather than buried.
 *
 * Watercolour is what the web app falls back to on its own
 * (`apps/web/src/map/tile-source.ts`), so only the alternative is ever written to `.env`.
 */
export type TileSource = "watercolor" | "osm";

export type TileSourceChoice = {
  source: TileSource;
  label: string;
  detail: string;
};

export const offeredTileSources: readonly TileSourceChoice[] = [
  {
    source: "watercolor",
    label: "Watercolour, via Stadia",
    detail: "the reference style, no key needed on localhost",
  },
  {
    source: "osm",
    label: "OpenStreetMap",
    detail: "plainer, but works from a phone on your network",
  },
];

export const defaultTileSource: TileSource = "watercolor";

export const openStreetMapTiles = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
