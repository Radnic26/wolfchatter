type ResizeCallback = () => void;

const callbacks = new Set<ResizeCallback>();

/**
 * jsdom has no ResizeObserver, and the map's own resize handling is behaviour worth a
 * spec, so the tests get one they can fire rather than a silence they cannot see into.
 */
function createResizeObserver(callback: ResizeCallback) {
  return {
    observe: () => callbacks.add(callback),
    unobserve: () => callbacks.delete(callback),
    disconnect: () => callbacks.delete(callback),
  };
}

export function installResizeObserver(): void {
  globalThis.ResizeObserver = createResizeObserver as unknown as typeof ResizeObserver;
}

/** Every element being watched has changed size, which is what a rotating phone does. */
export function resizeEverything(): void {
  for (const callback of callbacks) callback();
}

export function observedElementCount(): number {
  return callbacks.size;
}
