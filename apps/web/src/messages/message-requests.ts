import { type Message, messageSchema, type NewMessage } from "@wolfchatter/shared/schema";
import * as z from "zod";
import { api, readJson } from "../lib/api-client.ts";

const messageListSchema = z.array(messageSchema);

/**
 * With no cursor the server answers with the newest page, which is what a reader opening a
 * room wants; with one it answers only what has been said since, which is what a client
 * coming back from a dropped connection is missing.
 */
export async function fetchMessages(roomId: string, after?: string): Promise<Message[]> {
  const response = await api.rooms[":id"].messages.$get({
    param: { id: roomId },
    query: after === undefined ? {} : { after },
  });
  return readJson(response, messageListSchema);
}

export async function postMessage(roomId: string, posted: NewMessage): Promise<Message> {
  const response = await api.rooms[":id"].messages.$post({ param: { id: roomId }, json: posted });
  return readJson(response, messageSchema);
}
