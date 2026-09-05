import { useSyncExternalStore } from "react";
import { readSelectedRoomId, withSelectedRoom } from "./selected-room-url.ts";

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/** `pushState` fires no event of its own, so a move this app makes has to be announced. */
function subscribeToLocation(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * A history entry per room, so the browser's back button walks back through the rooms that
 * were open; selecting the room already open adds none.
 */
export function selectRoom(selected: string | null): void {
  const next = withSelectedRoom(window.location.href, selected);
  if (next === currentPath()) return;

  window.history.pushState(null, "", next);
  announce();
}

export function useSelectedRoomId(): string | null {
  return readSelectedRoomId(useSyncExternalStore(subscribeToLocation, () => window.location.search));
}
