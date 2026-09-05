/**
 * Leaflet gives its container `tabindex="0"`, so handing the keyboard back to the map is the
 * whole of "Escape returns you where you came from": Tab from there walks the pins again.
 * It is found by the class Leaflet writes on it, because a panel that closes a room has no
 * business holding a handle to the map.
 */
export function focusTheMap(): void {
  document.querySelector<HTMLElement>(".leaflet-container")?.focus();
}
