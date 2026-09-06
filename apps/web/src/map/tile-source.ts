export type TileSource = {
  url: string;
  attribution: string;
  maxZoom: number;
};

/**
 * The reference CodePen points at `tile.stamen.com`, which has answered 404 since the tiles
 * moved to Stadia in 2023 and was plain `http://` besides, so any https deployment would
 * have blocked it as mixed content. Stadia serves the same watercolour without a key, for
 * any host that sends a `Referer` — which is what `Referrer-Policy` on the server is for.
 * The archived raster stops at zoom 16; past that the map would go blank rather than sharpen.
 *
 * Tiles and the credit for them travel together, so the attribution is part of this value
 * rather than written anywhere else: the watercolour is drawn from OpenStreetMap data, and
 * naming the tile server without naming that would breach the licence it is served under.
 */
export const tileSource: TileSource = {
  url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
  attribution:
    '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 16,
};
