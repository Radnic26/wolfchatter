import { createChatClient, createChatStore } from "@wolfchatter/shared/client";
import type { LatLng } from "leaflet";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppHeader } from "./components/app-header.tsx";
import { browserUsernameStorage } from "./lib/browser-username-storage.ts";
import { randomUuid } from "./lib/random-uuid.ts";
import { socketUrl } from "./lib/socket-url.ts";
import { ChatMap } from "./map/chat-map.tsx";
import { fetchMessages } from "./messages/message-requests.ts";
import { loadRooms, openRoomAt } from "./rooms/room-actions.ts";
import { RoomPanel } from "./rooms/room-panel.tsx";
import { selectRoom, useSelectedRoomId } from "./rooms/use-selected-room.ts";

export function App() {
  const [store] = useState(() => createChatStore(browserUsernameStorage()));
  // The composition root is where the socket meets the typed HTTP client: the shared package
  // owns the reconnect and the backfill, and stays free of both this origin and this fetch.
  const [client] = useState(() =>
    createChatClient({ url: socketUrl(window.location), store, fetchHistory: fetchMessages }),
  );
  const { rooms, connection } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selectedRoomId = useSelectedRoomId();
  const [failedToOpen, setFailedToOpen] = useState(false);
  const [tappedRoomId, setTappedRoomId] = useState<string | null>(null);

  useEffect(() => {
    loadRooms(store).catch((failure: unknown) => {
      console.error("The rooms could not be loaded", failure);
    });
  }, [store]);

  useEffect(() => {
    client.connect();
    return () => client.close();
  }, [client]);

  /**
   * The room is selected on the tap rather than on the answer, so the panel is there within
   * the budget NFR-1 sets, and a tap on the map is also the one gesture that says "I came
   * here to write": below 768 px it opens the sheet, where a tap on a marker leaves the peek.
   */
  async function openRoom(point: LatLng) {
    const opening = { id: randomUuid(), lat: point.lat, lng: point.lng };

    setFailedToOpen(false);
    setTappedRoomId(opening.id);
    selectRoom(opening.id);

    try {
      await openRoomAt(store, opening);
    } catch (failure) {
      console.error("The chatroom could not be opened", failure);
      setFailedToOpen(true);
    }
  }

  const room = rooms.find((open) => open.id === selectedRoomId);

  return (
    <div className="flex h-dvh flex-col bg-ground text-ink">
      <AppHeader connection={connection} />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 flex-1">
          <ChatMap
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={selectRoom}
            onTapMap={openRoom}
          />
        </div>
        <RoomPanel
          key={room?.id ?? "no room"}
          store={store}
          client={client}
          room={room}
          failedToOpen={failedToOpen}
          openExpanded={room !== undefined && room.id === tappedRoomId}
        />
      </div>
    </div>
  );
}
