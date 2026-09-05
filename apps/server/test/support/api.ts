import { randomUUID } from "node:crypto";
import type { ServerFrame } from "@wolfchatter/shared/protocol";
import type { Room } from "@wolfchatter/shared/schema";
import { createApp } from "../../src/app.ts";
import type { Db, Queryable } from "../../src/db/db.ts";
import type { Broadcaster } from "../../src/ws/broadcaster.ts";
import { type DatabaseUnderTest, openMigratedDatabase } from "./databases.ts";

export const allowedTestOrigin = "http://localhost:5173";

/** Stands in for the hub: the frames a subscriber would have received, in publish order. */
function recordBroadcasts(published: ServerFrame[]): Broadcaster {
  return {
    publishRoomCreated: (room) => void published.push({ type: "room:created", room }),
    publishMessageCreated: (message) => void published.push({ type: "message:created", message }),
  };
}

export interface AppUnderTestOptions {
  /** Every request is its own caller unless the spec is about the limit itself. */
  addressOf?: () => string;
  now?: () => number;
}

export function appOver(db: Queryable, options: AppUnderTestOptions = {}, published: ServerFrame[] = []) {
  return createApp({
    db,
    broadcaster: recordBroadcasts(published),
    allowedOrigins: [allowedTestOrigin],
    addressOf: options.addressOf ?? (() => randomUUID()),
    now: options.now ?? (() => 0),
  });
}

export interface RunningApi {
  db: Db;
  published: ServerFrame[];
  request(path: string, init?: RequestInit): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
  createRoom(): Promise<Room>;
}

/** The app over a freshly migrated database, exercised the way a browser reaches it. */
export async function startApi(
  database: DatabaseUnderTest,
  options: AppUnderTestOptions = {},
): Promise<RunningApi> {
  const db = await openMigratedDatabase(database);
  const published: ServerFrame[] = [];
  const app = appOver(db, options, published);
  const request = async (path: string, init?: RequestInit) => await app.request(path, init);
  const post = (path: string, body: unknown) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  return {
    db,
    published,
    request,
    post,
    createRoom: async () =>
      (await post("/api/rooms", { id: randomUUID(), lat: 46.7712, lng: 23.6236 })).json() as Promise<Room>,
  };
}
