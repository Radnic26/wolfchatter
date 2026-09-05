import { type Message, messageSchema, type NewMessage } from "@wolfchatter/shared/schema";
import * as z from "zod";
import { api, readJson } from "../lib/api-client.ts";

const messageListSchema = z.array(messageSchema);

/** No cursor, so the server answers with the newest page: what a reader opening a room wants. */
export async function fetchMessages(roomId: string): Promise<Message[]> {
  const response = await api.rooms[":id"].messages.$get({ param: { id: roomId }, query: {} });
  return readJson(response, messageListSchema);
}

export async function postMessage(roomId: string, posted: NewMessage): Promise<Message> {
  const response = await api.rooms[":id"].messages.$post({ param: { id: roomId }, json: posted });
  return readJson(response, messageSchema);
}
