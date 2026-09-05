/**
 * The whole surface the features are allowed to use, so `pg` and PGlite stay
 * interchangeable and a query cannot reach for a driver-specific escape hatch.
 */
export interface Queryable {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  /** Multi-statement SQL without parameters: migration files, and nothing else. */
  exec(text: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<Result>(run: (tx: Queryable) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}
