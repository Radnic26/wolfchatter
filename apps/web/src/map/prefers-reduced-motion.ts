/**
 * Asked when a move is decided and when the map is built, rather than subscribed to: every
 * caller needs the answer at one moment and none of them needs to be told it changed.
 * `matchMedia` is absent in jsdom, where nothing animates anyway.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
