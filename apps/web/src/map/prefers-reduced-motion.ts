/**
 * Asked at the moment of the move rather than subscribed to, because the answer only
 * matters while a pan is being decided. `matchMedia` is absent in jsdom, where nothing
 * animates anyway.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
