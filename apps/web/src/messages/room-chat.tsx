import type { ChatStore, MapRoom } from "@wolfchatter/shared/client";
import type { Message } from "@wolfchatter/shared/schema";
import { useEffect, useOptimistic, useState } from "react";
import { composeMessage, loadMessages, sendMessage } from "./message-actions.ts";
import { MessageComposer } from "./message-composer.tsx";
import type { MessageDraft } from "./message-draft.ts";
import { MessageList } from "./message-list.tsx";
import { useRememberedUsername } from "./use-chat-store.ts";

type RoomChatProps = {
  store: ChatStore;
  room: MapRoom;
  messages: readonly Message[];
};

/** The server echoes the message back under the id it was sent with, which is where the two meet. */
function untilTheServerHasIt(held: readonly Message[], sending: Message): readonly Message[] {
  return held.some((message) => message.id === sending.id) ? held : [...held, sending];
}

export function RoomChat({ store, room, messages }: RoomChatProps) {
  const username = useRememberedUsername(store);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [visible, showWhileItSends] = useOptimistic(messages, untilTheServerHasIt);

  const roomId = room.id;
  const isStored = room.status === "stored";

  // A room this browser has only just clicked has no history to ask for, and asking would be
  // a 404: the server learns about it in the request this one is racing.
  useEffect(() => {
    if (!isStored) return;

    loadMessages(store, roomId).catch((failure: unknown) => {
      console.error("The messages could not be loaded", failure);
      setHistoryFailed(true);
    });
  }, [store, roomId, isStored]);

  async function send(draft: MessageDraft) {
    const message = composeMessage(roomId, draft);

    showWhileItSends(message);
    await sendMessage(store, message);
  }

  return (
    <>
      {historyFailed ? (
        <p role="alert" className="px-4 text-accent text-sm">
          The earlier messages could not be loaded.
        </p>
      ) : null}
      <MessageList messages={visible} />
      <MessageComposer username={username} disabled={!isStored} onSend={send} />
    </>
  );
}
