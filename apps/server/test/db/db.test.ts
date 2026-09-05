import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db.ts";
import { databasesUnderTest } from "../support/databases.ts";

describe.each(databasesUnderTest)("$name as a Db", (database) => {
  let db: Db;

  afterEach(async () => {
    await db.close();
  });

  it("returns the rows a parameterised query asks for", async () => {
    db = await database.open();

    const { rows } = await db.query<{ answer: number }>("SELECT $1::int AS answer", [42]);

    expect(rows).toEqual([{ answer: 42 }]);
  });

  it("keeps a parameter as a value even when it looks like SQL", async () => {
    db = await database.open();

    const { rows } = await db.query<{ text: string }>("SELECT $1::text AS text", ["'; DROP TABLE rooms;--"]);

    expect(rows).toEqual([{ text: "'; DROP TABLE rooms;--" }]);
  });

  it("runs several statements from one exec", async () => {
    db = await database.open();

    await db.exec("CREATE TABLE first (id int); CREATE TABLE second (id int);");

    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_name IN ('first', 'second')",
    );
    expect(rows).toEqual([{ count: 2 }]);
  });

  it("keeps what a transaction committed", async () => {
    db = await database.open();
    await db.exec("CREATE TABLE note (body text)");

    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO note (body) VALUES ($1)", ["kept"]);
    });

    const { rows } = await db.query<{ body: string }>("SELECT body FROM note");
    expect(rows).toEqual([{ body: "kept" }]);
  });

  it("returns what the transaction body returned", async () => {
    db = await database.open();

    await expect(db.transaction(async () => "done")).resolves.toBe("done");
  });

  it("undoes everything a failed transaction wrote", async () => {
    db = await database.open();
    await db.exec("CREATE TABLE note (body text)");

    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO note (body) VALUES ($1)", ["doomed"]);
        throw new Error("the migration failed halfway");
      }),
    ).rejects.toThrow("the migration failed halfway");

    const { rows } = await db.query("SELECT body FROM note");
    expect(rows).toEqual([]);
  });

  it("undoes the statements a failed exec had already run inside a transaction", async () => {
    db = await database.open();

    await expect(
      db.transaction(async (tx) => {
        await tx.exec("CREATE TABLE half (id int); CREATE TABLE half (id int);");
      }),
    ).rejects.toThrow();

    const { rows } = await db.query<{ table: string | null }>("SELECT to_regclass('half')::text AS table");
    expect(rows).toEqual([{ table: null }]);
  });

  it("reports the error the database raised", async () => {
    db = await database.open();

    await expect(db.query("SELECT * FROM nowhere")).rejects.toThrow(/nowhere/);
  });
});
