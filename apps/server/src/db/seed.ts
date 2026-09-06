import { randomUUID } from "node:crypto";
import { insertMessage } from "../messages/queries.ts";
import { insertRoom } from "../rooms/queries.ts";
import type { Db } from "./db.ts";

/**
 * A first run opens on an empty world, which reads as a broken map rather than a new one.
 * These are the places it opens on instead: real coordinates, all inside the default view
 * so none of them needs a pan to be found, with a few lines of conversation each. Rooms are
 * still named by the identity column, so these are Chatroom 1 upwards like any other.
 */
const samplePlaces = [
  {
    lat: 46.7712,
    lng: 23.6236,
    conversation: [
      { username: "ana", body: "Piața Unirii, by the fountain. Anyone around?" },
      { username: "mihai", body: "Two minutes away. Grab the bench in the shade." },
    ],
  },
  {
    lat: 44.4325,
    lng: 26.1039,
    conversation: [
      { username: "cristi", body: "Old Town is packed tonight." },
      { username: "ioana", body: "It always is. Try the side streets." },
    ],
  },
  {
    lat: 47.4979,
    lng: 19.0402,
    conversation: [
      { username: "petra", body: "Watching the river from the embankment." },
      { username: "zoltan", body: "Best hour of the day for it." },
    ],
  },
  {
    lat: 48.2082,
    lng: 16.3738,
    conversation: [
      { username: "lena", body: "Cathedral steps, waiting for the rain to stop." },
      { username: "tobias", body: "It won't. Coffee instead?" },
    ],
  },
  {
    lat: 50.0619,
    lng: 19.9368,
    conversation: [
      { username: "kasia", body: "Main square, the trumpet just played." },
      { username: "marek", body: "On my way over." },
    ],
  },
  {
    lat: 44.8125,
    lng: 20.4612,
    conversation: [{ username: "vuk", body: "Anyone here knows where the good burek is?" }],
  },
] as const;

async function hasRooms(db: Db): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM rooms LIMIT 1");
  return rows.length > 0;
}

/**
 * Only ever writes into a database with no rooms in it, so a restart, a second wizard run
 * and a real deployment that happens to carry the flag all leave the existing map alone.
 * One transaction, because half a seeded map is worse than none.
 */
export async function seedSampleData(db: Db): Promise<number> {
  if (await hasRooms(db)) return 0;

  return db.transaction(async (tx) => {
    for (const place of samplePlaces) {
      const { room } = await insertRoom(tx, { id: randomUUID(), lat: place.lat, lng: place.lng });
      for (const line of place.conversation) {
        await insertMessage(tx, room.id, { id: randomUUID(), ...line });
      }
    }
    return samplePlaces.length;
  });
}
