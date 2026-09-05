import * as z from "zod";

export type TileSource = {
  url: string;
  attribution: string;
  maxZoom: number;
};

/**
 * The reference CodePen points at `tile.stamen.com`, which has answered 404 since the
 * tiles moved to Stadia in 2023 and was plain `http://` besides, so any https deployment
 * would have blocked it as mixed content. Stadia serves the same watercolour without a
 * key on `localhost` — and only there, which is why the URL is configuration. The archived
 * raster stops at zoom 16; past that the map would go blank rather than sharpen.
 */
const watercolorTiles: TileSource = {
  url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
  attribution:
    '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 16,
};

/** What a general-purpose raster tile server serves up to; the watercolour archive is the exception. */
const defaultMaxZoom = 19;

/**
 * Tiles and the credit for them travel together: a tile server named without its own
 * attribution would be drawn under someone else's credit, which is both wrong and, for
 * OpenStreetMap, a licence breach. So one without the other is a configuration error.
 */
const tileEnvironment = z
  .object({
    VITE_TILE_URL: z.string().min(1).optional(),
    VITE_TILE_ATTRIBUTION: z.string().min(1).optional(),
  })
  .refine(
    (env) => (env.VITE_TILE_URL === undefined) === (env.VITE_TILE_ATTRIBUTION === undefined),
    "VITE_TILE_URL and VITE_TILE_ATTRIBUTION are set together or not at all",
  );

export function resolveTileSource(source: Record<string, unknown>): TileSource {
  const result = tileEnvironment.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid tile configuration.\n${z.prettifyError(result.error)}`);
  }

  const { VITE_TILE_URL: url, VITE_TILE_ATTRIBUTION: attribution } = result.data;
  if (url === undefined || attribution === undefined) return watercolorTiles;

  return { url, attribution, maxZoom: defaultMaxZoom };
}
