import type { MapRoom } from "@wolfchatter/shared/client";
import type { LeafletKeyboardEvent } from "leaflet";
import { memo } from "react";
import { Marker } from "react-leaflet";
import { pinIcon, selectedPinIcon } from "./marker-icon.ts";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";

type RoomMarkersProps = {
  rooms: readonly MapRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
};

function labelFor(room: MapRoom): string {
  return room.status === "stored" ? room.name : "New chatroom";
}

/**
 * Leaflet makes the pin focusable and gives it `role="button"`, and then stops: Enter and
 * Space arrive as key events on the layer and are never turned into a click, so without
 * this the pins are reachable by keyboard and impossible to open with one.
 */
function opensTheRoom(event: LeafletKeyboardEvent): boolean {
  const pressed = event.originalEvent.key;
  return pressed === "Enter" || pressed === " ";
}

/**
 * Memoised on purpose: every message that arrives re-renders the app around this layer, and
 * redrawing a few hundred markers for a line of chat is the one thing NFR-1 names outright.
 */
export const RoomMarkers = memo(function RoomMarkers({
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomMarkersProps) {
  // Leaflet pans the map to a pin that takes focus, and that pan is animated. Off, the pin
  // still takes focus and opening it brings the map along, without the flight.
  const followsFocus = !prefersReducedMotion();

  return rooms.map((room) => {
    const selected = room.id === selectedRoomId;
    const label = labelFor(room);
    return (
      <Marker
        // Leaflet takes the name when it builds the icon element and nothing writes it
        // again, so a pin would still announce itself as new long after the server had
        // named its room. The name is part of what this marker is, so it goes in the key.
        key={`${room.id} ${label}`}
        position={[room.lat, room.lng]}
        icon={selected ? selectedPinIcon : pinIcon}
        // The selected pin is the one a click is aimed at, so it is never underneath another.
        zIndexOffset={selected ? 1000 : 0}
        // `alt` is only written onto an icon element that is an image, and this one is a
        // `divIcon`, so the title is the whole of the pin's accessible name.
        title={label}
        autoPanOnFocus={followsFocus}
        eventHandlers={{
          click: () => onSelectRoom(room.id),
          keydown: (event) => {
            if (!opensTheRoom(event)) return;
            // Space scrolls the page otherwise, and the map goes with it.
            event.originalEvent.preventDefault();
            onSelectRoom(room.id);
          },
        }}
      />
    );
  });
});
