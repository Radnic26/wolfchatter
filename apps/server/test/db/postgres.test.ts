import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createPostgresDb } from "../../src/db/postgres.ts";

/**
 * The pooling behaviour is what the real-Postgres suite cannot show: which connection a
 * statement lands on, and whether a failed transaction rolls back and gives the client back.
 */
function fakePool(clientQuery = vi.fn().mockResolvedValue({ rows: [] })) {
  const release = vi.fn();
  const poolQuery = vi.fn().mockResolvedValue({ rows: [{ answer: 42 }] });
  const end = vi.fn().mockResolvedValue(undefined);
  const pool = {
    query: poolQuery,
    connect: vi.fn().mockResolvedValue({ query: clientQuery, release }),
    end,
  };
  return { pool: pool as unknown as Pool, poolQuery, clientQuery, release, end };
}

describe("createPostgresDb", () => {
  it("sends a query with its parameters and hands back the rows", async () => {
    const { pool, poolQuery } = fakePool();

    const result = await createPostgresDb(pool).query("SELECT $1::int AS answer", [42]);

    expect(poolQuery).toHaveBeenCalledWith("SELECT $1::int AS answer", [42]);
    expect(result.rows).toEqual([{ answer: 42 }]);
  });

  it("sends an exec without parameters, so several statements are allowed", async () => {
    const { pool, poolQuery } = fakePool();

    await createPostgresDb(pool).exec("CREATE TABLE a (id int); CREATE TABLE b (id int);");

    expect(poolQuery).toHaveBeenCalledWith("CREATE TABLE a (id int); CREATE TABLE b (id int);");
  });

  it("holds one connection for the whole transaction and commits on it", async () => {
    const { pool, clientQuery, poolQuery, release } = fakePool();

    await createPostgresDb(pool).transaction(async (tx) => {
      await tx.query("INSERT INTO note (body) VALUES ($1)", ["kept"]);
      await tx.exec("CREATE TABLE note (body text)");
    });

    expect(clientQuery.mock.calls.map(([text]) => text)).toEqual([
      "BEGIN",
      "INSERT INTO note (body) VALUES ($1)",
      "CREATE TABLE note (body text)",
      "COMMIT",
    ]);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and still returns the connection when the body throws", async () => {
    const { pool, clientQuery, release } = fakePool();

    await expect(
      createPostgresDb(pool).transaction(async () => {
        throw new Error("halfway");
      }),
    ).rejects.toThrow("halfway");

    expect(clientQuery.mock.calls.map(([text]) => text)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("closes the pool", async () => {
    const { pool, end } = fakePool();

    await createPostgresDb(pool).close();

    expect(end).toHaveBeenCalledOnce();
  });
});
