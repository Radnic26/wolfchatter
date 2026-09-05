/**
 * Deciding which presses on the map are meant to open a room. A finger dragging the map
 * arrives as a click whose press and release are far apart, a second finger lands far from
 * the first, and a double click arrives as two clicks a moment apart — none of the three
 * should leave a pin. The first click of a double still opens its room immediately, because
 * NFR-1 gives the panel 100 ms and that is no budget for waiting to see what follows.
 */
export type Press = {
  x: number;
  y: number;
  time: number;
};

/** Leaflet's own click tolerance is 3 px, which is a mouse's tolerance rather than a finger's. */
const panMovement = 10;
/** Long enough for a deliberate tap, short enough that a press and hold is not one. */
const panDuration = 700;
/** The gap browsers themselves use to pair two clicks into a double click. */
const repeatWindow = 300;
const repeatMovement = 24;

function distance(from: Press, to: Press): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export type TapRecogniser = {
  press: (press: Press) => void;
  /** Whether the gesture that just ended is a tap, and one that has not already counted. */
  release: (release: Press) => boolean;
};

export function createTapRecogniser(): TapRecogniser {
  let pressed: Press | null = null;
  let previousTap: Press | null = null;

  function repeatsPreviousTap(tap: Press): boolean {
    if (previousTap === null) return false;
    return tap.time - previousTap.time < repeatWindow && distance(previousTap, tap) <= repeatMovement;
  }

  return {
    press(press) {
      pressed = press;
    },

    release(release) {
      const started = pressed;
      pressed = null;

      if (started === null) return false;
      if (distance(started, release) > panMovement) return false;
      if (release.time - started.time > panDuration) return false;

      const repeats = repeatsPreviousTap(release);
      // Even a suppressed tap is what a third click is measured against, so a triple click
      // opens one room rather than two.
      previousTap = release;
      return !repeats;
    },
  };
}
