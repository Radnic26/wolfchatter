import type { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "./db.ts";

/** A transaction exposes the same two calls as the client itself, so one wrapper serves both. */
type PgliteSession = Pick<PGlite, "query" | "exec">;

function queryableOver(session: PgliteSession): Queryable {
  return {
    async query<Row>(text: string, params?: unknown[]) {
      const { rows } = await session.query<Row>(text, params);
      return { rows };
    },
    async exec(text: string) {
      await session.exec(text);
    },
  };
}

export function createPgliteDb(client: PGlite): Db {
  return {
    ...queryableOver(client),
    transaction: (run) => client.transaction((tx) => run(queryableOver(tx))),
    close: () => client.close(),
  };
}
