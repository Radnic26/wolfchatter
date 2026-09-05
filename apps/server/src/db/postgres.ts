import type { Pool } from "pg";
import type { Db, Queryable } from "./db.ts";

/** A pooled client answers the same call as the pool, so one wrapper serves both. */
type PostgresSession = Pick<Pool, "query">;

function queryableOver(session: PostgresSession): Queryable {
  return {
    async query<Row>(text: string, params?: unknown[]) {
      const { rows } = await session.query(text, params as unknown[]);
      return { rows: rows as Row[] };
    },
    async exec(text: string) {
      // Without parameters this goes out as a simple query, which is what lets one
      // migration file hold several statements.
      await session.query(text);
    },
  };
}

export function createPostgresDb(pool: Pool): Db {
  return {
    ...queryableOver(pool),
    async transaction<Result>(run: (tx: Queryable) => Promise<Result>) {
      // The pool hands out a different connection per call, so a transaction has to hold
      // one client for its whole life or the COMMIT lands on a stranger.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await run(queryableOver(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
