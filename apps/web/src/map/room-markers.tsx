import type { MapRoom } from "@wolfchatter/shared/client";
import { memo } from "react";
import { Marker } from "react-leaflet";
import { pinIcon, selectedPinIcon } from "./marker-icon.ts";

type RoomMarkersProps = {
  rooms: readonly MapRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
};

function labelFor(room: MapRoom): string {
  return room.status === "stored" ? room.name : "New chatroom";
}

/**
 * Memoised on purpose: from the next pull request on, every message that arrives re-renders
 * the app around this layer, and redrawing a few hundred markers for a line of chat is the
 * one thing NFR-1 names outright.
 */
export const RoomMarkers = memo(function RoomMarkers({
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomMarkersProps) {
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
        alt={label}
        title={label}
        eventHandlers={{ click: () => onSelectRoom(room.id) }}
      />
    );
  });
});
