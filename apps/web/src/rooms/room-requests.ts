import type { AppType } from "@wolfchatter/server/app";
import { type NewRoom, type Room, roomSchema } from "@wolfchatter/shared/schema";
import { hc } from "hono/client";
import * as z from "zod";

/**
 * Same origin in development through Vite's proxy and in production behind the server that
 * serves this bundle, so there is no origin to configure and no CORS to allow.
 */
const api = hc<AppType>("/").api;

const roomListSchema = z.array(roomSchema);

/** The network is a boundary like any other: a response becomes a Room only by parsing. */
async function readJson<Parsed>(response: Response, schema: z.ZodType<Parsed>): Promise<Parsed> {
  if (!response.ok) {
    throw new Error(`${response.url} answered ${response.status}`);
  }
  return schema.parse(await response.json());
}

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
