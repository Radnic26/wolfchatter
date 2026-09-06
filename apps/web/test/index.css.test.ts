import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

// Read rather than imported, because Vitest stubs a CSS import with an empty file.
const resolveFrom = createRequire(import.meta.url);
const leafletStylesheet = readFileSync(resolveFrom.resolve("leaflet/dist/leaflet.css"), "utf8");
const writtenStylesheet = readFileSync(resolveFrom.resolve("../src/index.css"), "utf8");
// Tailwind's layers are generated at build time and lose to unlayered CSS wherever the two
// meet, so what the app decides is the rules written in this file; the `@import` naming
// Tailwind is a URL no parser here can fetch.
const appStylesheet = writtenStylesheet.replace('@import "tailwindcss";', "");

/** FR-10's breakpoint, below which the sheet lies over the map. */
const smallViewport = "(width < 48rem)";

/** The markup Leaflet builds for the zoom control, under the container class it chose. */
function zoomButtonInside(mapClasses: string): HTMLAnchorElement {
  const map = document.createElement("div");
  map.className = mapClasses;
  const bar = document.createElement("div");
  bar.className = "leaflet-control-zoom leaflet-bar";
  const button = document.createElement("a");
  button.className = "leaflet-control-zoom-in";

  bar.append(button);
  map.append(bar);
  document.body.append(map);

  return button;
}

function asksForTheSmallViewport(rule: CSSRule): rule is CSSMediaRule {
  return rule instanceof CSSMediaRule && rule.conditionText === smallViewport;
}

function offsetBelowTheBreakpoint(selector: string): string {
  const belowTheBreakpoint = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter(asksForTheSmallViewport)
    .flatMap((query) => [...query.cssRules]);
  const rule = belowTheBreakpoint.find(
    (candidate) => candidate instanceof CSSStyleRule && candidate.selectorText === selector,
  );

  if (!(rule instanceof CSSStyleRule)) {
    throw new Error(`The stylesheet has no ${selector} below the breakpoint`);
  }

  return rule.style.bottom;
}

beforeEach(() => {
  // The order the built page links them in, which is what lets a rule of ours answer one of
  // Leaflet's own at the same specificity.
  document.head.innerHTML = `<style>${leafletStylesheet}</style><style>${appStylesheet}</style>`;
  document.body.innerHTML = "";
});

describe("the app's stylesheet", () => {
  it("gives Leaflet's own zoom buttons the 44 px touch target, on a touch screen too", () => {
    const withMouse = getComputedStyle(zoomButtonInside("leaflet-container"));
    const withFingers = getComputedStyle(zoomButtonInside("leaflet-container leaflet-touch"));

    expect([withMouse.width, withMouse.height]).toEqual(["44px", "44px"]);
    expect([withFingers.width, withFingers.height]).toEqual(["44px", "44px"]);
  });

  it("lifts the tile credit over the collapsed sheet, the strip the safe area reserves included", () => {
    expect(offsetBelowTheBreakpoint(".leaflet-bottom.leaflet-right")).toBe("var(--spacing-peek-safe)");
  });
});
