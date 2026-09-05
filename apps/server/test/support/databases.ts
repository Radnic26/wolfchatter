import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import type { Db } from "../../src/db/db.ts";
import { applyMigrations, migrationsDirectory } from "../../src/db/migrate.ts";
import { createPgliteDb } from "../../src/db/pglite.ts";
import { createPostgresDb } from "../../src/db/postgres.ts";

export interface DatabaseUnderTest {
  name: string;
  open(): Promise<Db>;
}

/** Always available, with nothing to install: the driver a fresh clone runs on. */
export const embeddedDatabase: DatabaseUnderTest = {
  name: "PGlite",
  open: async () => createPgliteDb(new PGlite("memory://")),
};

function databaseUrlFor(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.href;
}

/**
 * Every suite gets its own throwaway database, so migrations run against a blank server
 * exactly as they do on a first boot and two suites can never see each other's rows.
 */
function postgres(serverUrl: string): DatabaseUnderTest {
  return {
    name: "PostgreSQL",
    async open() {
      // A database name cannot be a bind parameter. This one is generated, never user input.
      const name = `wolfchatter_test_${randomUUID().replaceAll("-", "")}`;
      const admin = new pg.Pool({ connectionString: serverUrl });
      await admin.query(`CREATE DATABASE "${name}"`);
      await admin.end();

      const db = createPostgresDb(new pg.Pool({ connectionString: databaseUrlFor(serverUrl, name) }));
      return {
        ...db,
        async close() {
          await db.close();
          const cleanup = new pg.Pool({ connectionString: serverUrl });
          await cleanup.query(`DROP DATABASE "${name}"`);
          await cleanup.end();
        },
      };
    },
  };
}

/** Postgres joins the run only when a server is reachable, so a clone with no Docker still passes. */
export const databasesUnderTest: DatabaseUnderTest[] = process.env.DATABASE_URL
  ? [embeddedDatabase, postgres(process.env.DATABASE_URL)]
  : [embeddedDatabase];

/** The schema every feature test starts from: a blank database with the migrations applied. */
export async function openMigratedDatabase(database: DatabaseUnderTest): Promise<Db> {
  const db = await database.open();
  await applyMigrations(db, migrationsDirectory);
  return db;
}
