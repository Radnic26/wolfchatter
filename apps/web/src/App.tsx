import { createChatClient, createChatStore } from "@wolfchatter/shared/client";
import type { LatLng } from "leaflet";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppHeader } from "./components/app-header.tsx";
import { browserUsernameStorage } from "./lib/browser-username-storage.ts";
import { randomUuid } from "./lib/random-uuid.ts";
import { socketUrl } from "./lib/socket-url.ts";
import { ChatMap } from "./map/chat-map.tsx";
import { focusTheMap } from "./map/focus-the-map.ts";
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
  const [roomToWriteInId, setRoomToWriteInId] = useState<string | null>(null);

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
  const openRoom = useCallback(
    async (point: LatLng) => {
      const opening = { id: randomUuid(), lat: point.lat, lng: point.lng };

      setFailedToOpen(false);
      setRoomToWriteInId(opening.id);
      selectRoom(opening.id);

      try {
        await openRoomAt(store, opening);
      } catch (failure) {
        console.error("The chatroom could not be opened", failure);
        setFailedToOpen(true);
      }
    },
    [store],
  );

  /** A pin asks "what is this?", so the sheet stays a peek and any earlier failure goes. */
  const showRoom = useCallback((roomId: string) => {
    setFailedToOpen(false);
    setRoomToWriteInId(null);
    selectRoom(roomId);
  }, []);

  /** The room is let go of, and the keyboard goes back to the map the pins are on. */
  function closeRoom() {
    setFailedToOpen(false);
    setRoomToWriteInId(null);
    selectRoom(null);
    focusTheMap();
  }

  const room = rooms.find((open) => open.id === selectedRoomId);

  return (
    <div className="flex h-dvh flex-col bg-ground text-ink">
      {/* Every pin on the map is a stop on the way to the composer, so this is the way past
          them. It shows itself only once it has the focus, which is the only time it helps. */}
      <a
        href="#chatroom"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[2000] focus:m-2 focus:rounded-lg focus:border focus:border-rule focus:bg-ground focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to the chatroom
      </a>
      <AppHeader connection={connection} />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 flex-1">
          <ChatMap
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={showRoom}
            onTapMap={openRoom}
          />
        </div>
        <RoomPanel
          key={room?.id ?? "no room"}
          store={store}
          client={client}
          room={room}
          failedToOpen={failedToOpen}
          openExpanded={room !== undefined && room.id === roomToWriteInId}
          onClose={closeRoom}
        />
      </div>
    </div>
  );
}
