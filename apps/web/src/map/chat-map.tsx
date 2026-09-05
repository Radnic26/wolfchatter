import type { MapRoom } from "@wolfchatter/shared/client";
import type { LatLng, LatLngTuple } from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { MapTaps } from "./map-taps.tsx";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";
import { RoomMarkers } from "./room-markers.tsx";
import { resolveTileSource } from "./tile-source.ts";
import "leaflet/dist/leaflet.css";

/** The view of the reference: Cluj-Napoca, far enough out to place it in the country. */
const initialCenter: LatLngTuple = [46.7712, 23.6236];
const initialZoom = 5;

const tiles = resolveTileSource(import.meta.env);

type ChatMapProps = {
  rooms: readonly MapRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onTapMap: (point: LatLng) => void;
};

/**
 * Brings a room the map is not showing into view — a link opened on a room across the
 * country, or the back button returning to one. A room that is already on screen is left
 * where it is, so opening one by clicking does not tug the map out from under the click.
 */
function FollowSelectedRoom({ room }: { room: MapRoom | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (room === undefined) return;

    const position: LatLngTuple = [room.lat, room.lng];
    if (map.getBounds().contains(position)) return;
    if (prefersReducedMotion()) map.setView(position, map.getZoom());
    else map.flyTo(position, map.getZoom());
  }, [map, room]);

  return null;
}

export function ChatMap({ rooms, selectedRoomId, onSelectRoom, onTapMap }: ChatMapProps) {
  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      className="h-full w-full"
      // Leaflet reads the two above once, at mount, so the view is moved with `flyTo`.
    >
      <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
      <MapTaps onTap={onTapMap} />
      <RoomMarkers rooms={rooms} selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom} />
      <FollowSelectedRoom room={rooms.find((room) => room.id === selectedRoomId)} />
    </MapContainer>
  );
}
