import type { Room } from "@wolfchatter/shared/schema";
import { createApp } from "../../src/app.ts";
import type { Db } from "../../src/db/db.ts";
import { type DatabaseUnderTest, openMigratedDatabase } from "./databases.ts";

export interface RunningApi {
  db: Db;
  request(path: string, init?: RequestInit): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
  createRoom(): Promise<Room>;
}

/** The app over a freshly migrated database, exercised the way a browser reaches it. */
export async function startApi(database: DatabaseUnderTest): Promise<RunningApi> {
  const db = await openMigratedDatabase(database);
  const app = createApp(db);
  const request = async (path: string, init?: RequestInit) => await app.request(path, init);
  const post = (path: string, body: unknown) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  return {
    db,
    request,
    post,
    createRoom: async () =>
      (await post("/api/rooms", { lat: 46.7712, lng: 23.6236 })).json() as Promise<Room>,
  };
}
