import type { ChatStore } from "@wolfchatter/shared/client";
import type { Message } from "@wolfchatter/shared/schema";
import { randomUuid } from "../lib/random-uuid.ts";
import type { MessageDraft } from "./message-draft.ts";
import { fetchMessages, postMessage } from "./message-requests.ts";

export async function loadMessages(store: ChatStore, roomId: string): Promise<void> {
  store.setMessages(roomId, await fetchMessages(roomId));
}

/**
 * The message its sender sees before the round trip. The id is minted here and travels with
 * the request, so a retry is stored once; the timestamp is this browser's clock and stands
 * in only until the server's own answer takes its place.
 */
export function composeMessage(roomId: string, draft: MessageDraft): Message {
  return { id: randomUuid(), roomId, ...draft, createdAt: new Date().toISOString() };
}

/** The name is remembered only once a message has gone through under it. */
export async function sendMessage(store: ChatStore, message: Message): Promise<void> {
  const { id, username, body } = message;

  store.addMessage(await postMessage(message.roomId, { id, username, body }));
  store.setUsername(username);
}
