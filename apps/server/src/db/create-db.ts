import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import type { Db } from "./db.ts";
import { createPgliteDb } from "./pglite.ts";
import { createPostgresDb } from "./postgres.ts";

/** PGlite reads `memory://` and `idb://` as locations rather than as paths on disk. */
function isPathOnDisk(location: string): boolean {
  return !location.includes("://");
}

/** No DATABASE_URL means the embedded database, which is what a first run gets. */
export function createDb(databaseUrl: string | undefined, embeddedDataLocation: string): Db {
  if (databaseUrl) {
    return createPostgresDb(new pg.Pool({ connectionString: databaseUrl }));
  }

  // PGlite creates its own data directory but not the parents of it, and a fresh clone has
  // no `data/` at all, so the first embedded run would fail before the first migration.
  if (isPathOnDisk(embeddedDataLocation)) {
    mkdirSync(embeddedDataLocation, { recursive: true });
  }

  return createPgliteDb(new PGlite(embeddedDataLocation));
}
