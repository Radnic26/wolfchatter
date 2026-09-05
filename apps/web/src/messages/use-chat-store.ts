import type { ChatStore } from "@wolfchatter/shared/client";
import type { Message } from "@wolfchatter/shared/schema";
import { useSyncExternalStore } from "react";

/** One array for every room that has no history, so the snapshot a component reads is stable. */
const noMessages: readonly Message[] = [];

export function useRoomMessages(store: ChatStore, roomId: string | undefined): readonly Message[] {
  return useSyncExternalStore(store.subscribe, () =>
    roomId === undefined ? noMessages : (store.getSnapshot().messagesByRoom.get(roomId) ?? noMessages),
  );
}

export function useRememberedUsername(store: ChatStore): string {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().username);
}
