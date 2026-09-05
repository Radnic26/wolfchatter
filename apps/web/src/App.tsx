import { createChatStore } from "@wolfchatter/shared/client";
import type { LatLng } from "leaflet";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppHeader } from "./components/app-header.tsx";
import { ChatMap } from "./map/chat-map.tsx";
import { loadRooms, openRoomAt } from "./rooms/room-actions.ts";
import { RoomPanel } from "./rooms/room-panel.tsx";
import { selectRoom, useSelectedRoomId } from "./rooms/use-selected-room.ts";

export function App() {
  const [store] = useState(createChatStore);
  const { rooms } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selectedRoomId = useSelectedRoomId();
  const [failedToOpen, setFailedToOpen] = useState(false);

  useEffect(() => {
    loadRooms(store).catch((failure: unknown) => {
      console.error("The rooms could not be loaded", failure);
    });
  }, [store]);

  async function openRoom(point: LatLng) {
    setFailedToOpen(false);
    try {
      selectRoom(await openRoomAt(store, { lat: point.lat, lng: point.lng }));
    } catch (failure) {
      console.error("The chatroom could not be opened", failure);
      setFailedToOpen(true);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-ground text-ink">
      <AppHeader />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 flex-1">
          <ChatMap
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={selectRoom}
            onTapMap={openRoom}
          />
        </div>
        <RoomPanel room={rooms.find((room) => room.id === selectedRoomId)} failedToOpen={failedToOpen} />
      </div>
    </div>
  );
}
