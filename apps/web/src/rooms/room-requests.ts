import { type NewRoom, type Room, roomSchema } from "@wolfchatter/shared/schema";
import * as z from "zod";
import { api, readJson } from "../lib/api-client.ts";

const roomListSchema = z.array(roomSchema);

export async function fetchRooms(): Promise<Room[]> {
  return readJson(await api.rooms.$get(), roomListSchema);
}

/**
 * The id is minted here and travels with the request, so a retry after a dropped response
 * is answered with the room the first attempt already made instead of a second pin.
 */
export async function createRoom(point: NewRoom): Promise<Room> {
  return readJson(await api.rooms.$post({ json: point }), roomSchema);
}
