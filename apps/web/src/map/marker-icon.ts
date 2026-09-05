import { divIcon } from "leaflet";

/**
 * The Dropped Pin of `docs/brand.md`, drawn at the size a finger needs: the same 64 grid,
 * the same 3.5 stroke and the same W as `brand/state-map-*.svg`, with the monogram ringed.
 * Leaflet's own icon is a pair of images resolved from a base path a bundler moves, and is
 * 25 by 41 where FR-10 asks for 44, so the pin is drawn here rather than configured.
 *
 * The outline is the mark; the fill is the panel's own ground, because a hollow pin leaves
 * the watercolour showing through the monogram and stops reading as a pin at all.
 */
const pin = `<svg width="28" height="36" viewBox="11.25 5.25 41.5 53.5" aria-hidden="true">
  <path d="M32 7C21.5 7 13 15.5 13 26c0 8 7 18 19 31 12-13 19-23 19-31C51 15.5 42.5 7 32 7Z"
    fill="var(--color-ground)" stroke="currentColor" stroke-width="3.5" stroke-linejoin="miter" />
  <circle cx="32" cy="26" r="11" fill="none" stroke="currentColor" stroke-width="3" />
  <path d="M26 22.7 28.7 29.6 32 24.5 35.3 29.6 38 22.7"
    fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter" />
</svg>`;

function createPinIcon(tone: string) {
  return divIcon({
    // Leaflet's own class paints a white box behind the icon.
    className: "",
    html: `<span class="flex h-11 w-11 items-end justify-center ${tone}">${pin}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
  });
}

export const pinIcon = createPinIcon("text-ink");
export const selectedPinIcon = createPinIcon("text-accent");
