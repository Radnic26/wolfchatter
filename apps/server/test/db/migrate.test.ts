import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { applyMigrations, migrationsDirectory } from "../../src/db/migrate.ts";
import { databasesUnderTest } from "../support/databases.ts";

async function directoryContaining(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wolfchatter-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(directory, name), sql);
  }
  return directory;
}

async function tableNames(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  return rows.map((row) => row.table_name);
}

describe.each(databasesUnderTest)("applyMigrations on $name", (database) => {
  let db: Db;

  afterEach(async () => {
    await db.close();
  });

  it("creates the schema the app boots on", async () => {
    db = await database.open();

    const applied = await applyMigrations(db, migrationsDirectory);

    expect(applied).toEqual(["0001_rooms_and_messages.sql"]);
    expect(await tableNames(db)).toEqual(["messages", "rooms", "schema_migrations"]);
  });

  it("does nothing on the next boot", async () => {
    db = await database.open();
    await applyMigrations(db, migrationsDirectory);

    await expect(applyMigrations(db, migrationsDirectory)).resolves.toEqual([]);
  });

  it("applies files in name order", async () => {
    db = await database.open();
    const directory = await directoryContaining({
      "0002_second.sql": "CREATE TABLE second (id int)",
      "0001_first.sql": "CREATE TABLE first (id int)",
    });

    await expect(applyMigrations(db, directory)).resolves.toEqual(["0001_first.sql", "0002_second.sql"]);
  });

  it("applies only the file that is new", async () => {
    db = await database.open();
    const first = await directoryContaining({ "0001_first.sql": "CREATE TABLE first (id int)" });
    await applyMigrations(db, first);
    const both = await directoryContaining({
      "0001_first.sql": "CREATE TABLE first (id int)",
      "0002_second.sql": "CREATE TABLE second (id int)",
    });

    await expect(applyMigrations(db, both)).resolves.toEqual(["0002_second.sql"]);
  });

  it("ignores anything that is not a migration file", async () => {
    db = await database.open();
    const directory = await directoryContaining({
      "0001_first.sql": "CREATE TABLE first (id int)",
      "README.md": "not a migration",
    });

    await expect(applyMigrations(db, directory)).resolves.toEqual(["0001_first.sql"]);
  });

  it("refuses to boot when a file that already ran was edited", async () => {
    db = await database.open();
    const original = await directoryContaining({ "0001_first.sql": "CREATE TABLE first (id int)" });
    await applyMigrations(db, original);
    const edited = await directoryContaining({
      "0001_first.sql": "CREATE TABLE first (id int, extra text)",
    });

    await expect(applyMigrations(db, edited)).rejects.toThrow(/edited after it ran/);
  });

  it("leaves no half-applied file behind when one statement fails", async () => {
    db = await database.open();
    const directory = await directoryContaining({
      "0001_broken.sql": "CREATE TABLE kept (id int); CREATE TABLE kept (id int);",
    });

    await expect(applyMigrations(db, directory)).rejects.toThrow();

    expect(await tableNames(db)).toEqual(["schema_migrations"]);
    const { rows } = await db.query("SELECT filename FROM schema_migrations");
    expect(rows).toEqual([]);
  });
});
