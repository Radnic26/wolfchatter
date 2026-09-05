import { randomUUID } from "node:crypto";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { selectRoom, useSelectedRoomId } from "../../src/rooms/use-selected-room.ts";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useSelectedRoomId", () => {
  it("reads the room the link arrived with, so a deep link opens it", () => {
    const id = randomUUID();
    window.history.replaceState(null, "", `/?room=${id}`);

    const { result } = renderHook(() => useSelectedRoomId(), { wrapper: StrictMode });

    expect(result.current).toBe(id);
  });

  it("follows a room that is selected while it is mounted", () => {
    const id = randomUUID();
    const { result } = renderHook(() => useSelectedRoomId(), { wrapper: StrictMode });

    act(() => {
      selectRoom(id);
    });

    expect(result.current).toBe(id);
    expect(window.location.search).toBe(`?room=${id}`);
  });

  it("goes back to the room before it when the browser goes back", async () => {
    const first = randomUUID();
    const second = randomUUID();
    const { result } = renderHook(() => useSelectedRoomId(), { wrapper: StrictMode });
    act(() => {
      selectRoom(first);
    });
    act(() => {
      selectRoom(second);
    });

    // The browser traverses history on its own schedule, so the test waits for the event
    // rather than for a number of milliseconds.
    await act(async () => {
      const traversed = new Promise<void>((resolve) => {
        window.addEventListener("popstate", () => resolve(), { once: true });
      });
      window.history.back();
      await traversed;
    });

    expect(result.current).toBe(first);
  });

  it("adds no history entry for the room already open", () => {
    const id = randomUUID();
    renderHook(() => useSelectedRoomId(), { wrapper: StrictMode });
    act(() => {
      selectRoom(id);
    });
    const depth = window.history.length;

    act(() => {
      selectRoom(id);
    });

    expect(window.history.length).toBe(depth);
  });

  it("stops following the location once it is unmounted", () => {
    const { unmount } = renderHook(() => useSelectedRoomId(), { wrapper: StrictMode });

    unmount();

    expect(() => selectRoom(randomUUID())).not.toThrow();
  });
});
