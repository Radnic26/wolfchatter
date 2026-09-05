import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/create-db.ts";

const temporaryDirectories: string[] = [];

async function unusedPathTwoLevelsDeep(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "wolfchatter-first-run-"));
  temporaryDirectories.push(parent);
  return join(parent, "data", "pg");
}

describe("createDb", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
  });

  it("runs the embedded database when no url is configured", async () => {
    const db = createDb(undefined, "memory://");

    await expect(db.query<{ answer: number }>("SELECT 1 AS answer")).resolves.toEqual({
      rows: [{ answer: 1 }],
    });

    await db.close();
  });

  it("makes room for the embedded database on a clone that has no data directory", async () => {
    const location = await unusedPathTwoLevelsDeep();
    expect(existsSync(location)).toBe(false);

    const db = createDb(undefined, location);

    await expect(db.query<{ answer: number }>("SELECT 1 AS answer")).resolves.toEqual({
      rows: [{ answer: 1 }],
    });
    expect(existsSync(location)).toBe(true);

    await db.close();
  });

  it("creates no directory for a database that lives in memory", async () => {
    const db = createDb(undefined, "memory://");

    await db.query("SELECT 1");
    expect(existsSync("memory:")).toBe(false);

    await db.close();
  });

  it("talks to the configured server when a url is given", async () => {
    const db = createDb("postgres://wolfchatter:secret@127.0.0.1:1/wolfchatter", "memory://");

    await expect(db.query("SELECT 1")).rejects.toThrow(/ECONNREFUSED/);

    await db.close();
  });
});
