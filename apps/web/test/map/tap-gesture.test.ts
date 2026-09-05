import { beforeEach, describe, expect, it } from "vitest";
import { createTapRecogniser, type Press, type TapRecogniser } from "../../src/map/tap-gesture.ts";

const at = (x: number, y: number, time: number): Press => ({ x, y, time });

function gesture(recogniser: TapRecogniser, from: Press, to: Press = from): boolean {
  recogniser.press(from);
  return recogniser.release(to);
}

describe("createTapRecogniser", () => {
  let recogniser: TapRecogniser;

  beforeEach(() => {
    recogniser = createTapRecogniser();
  });

  it("opens a room for a press and release in the same place", () => {
    expect(gesture(recogniser, at(100, 100, 0))).toBe(true);
  });

  it("forgives the wobble of a finger that meant to tap", () => {
    expect(gesture(recogniser, at(100, 100, 0), at(106, 104, 120))).toBe(true);
  });

  it("opens no room for a pan, however short", () => {
    expect(gesture(recogniser, at(100, 100, 0), at(160, 100, 200))).toBe(false);
  });

  it("opens no room for a press held on the map", () => {
    expect(gesture(recogniser, at(100, 100, 0), at(100, 100, 900))).toBe(false);
  });

  it("opens no room for a pinch, whose two fingers are nowhere near each other", () => {
    recogniser.press(at(100, 100, 0));
    recogniser.press(at(200, 200, 20));

    expect(recogniser.release(at(90, 90, 300))).toBe(false);
    expect(recogniser.release(at(220, 220, 320))).toBe(false);
  });

  it("opens a room again after a pinch, so the map is not left deaf", () => {
    recogniser.press(at(100, 100, 0));
    recogniser.press(at(200, 200, 20));
    recogniser.release(at(90, 90, 300));
    recogniser.release(at(220, 220, 320));

    expect(gesture(recogniser, at(300, 300, 1000))).toBe(true);
  });

  it("ignores a release from a press that started somewhere else", () => {
    expect(recogniser.release(at(100, 100, 0))).toBe(false);
  });

  it("opens one room for a double click, at the first of the two", () => {
    expect(gesture(recogniser, at(100, 100, 0))).toBe(true);
    expect(gesture(recogniser, at(101, 102, 140))).toBe(false);
  });

  it("opens one room for a triple click", () => {
    gesture(recogniser, at(100, 100, 0));
    gesture(recogniser, at(101, 102, 140));

    expect(gesture(recogniser, at(100, 101, 280))).toBe(false);
  });

  it("opens a second room for a deliberate second click in the same place", () => {
    gesture(recogniser, at(100, 100, 0));

    expect(gesture(recogniser, at(100, 100, 400))).toBe(true);
  });

  it("opens a second room for a quick click somewhere else on the map", () => {
    gesture(recogniser, at(100, 100, 0));

    expect(gesture(recogniser, at(300, 300, 140))).toBe(true);
  });
});
