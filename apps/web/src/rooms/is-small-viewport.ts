/**
 * FR-10's 768 px, asked in JavaScript only where the two layouts mean different things:
 * Escape puts the sheet down, and above the breakpoint there is no sheet to put down. The
 * layout itself stays in CSS. `matchMedia` is absent in jsdom, where there is one layout.
 */
export function isSmallViewport(): boolean {
  return window.matchMedia?.("(width < 48rem)").matches === true;
}
