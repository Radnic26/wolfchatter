import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db.ts";

export const migrationsDirectory = join(import.meta.dirname, "migrations");

const createLedger = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

async function recordedChecksums(db: Db): Promise<Map<string, string>> {
  const { rows } = await db.query<{ filename: string; checksum: string }>(
    "SELECT filename, checksum FROM schema_migrations",
  );
  return new Map(rows.map(({ filename, checksum }) => [filename, checksum]));
}

/**
 * Applies the pending files in name order, each in its own transaction, and returns the
 * ones it ran. A file that already ran is never replayed and never rewritten: its checksum
 * is compared, so an edit to applied history fails the boot instead of drifting silently.
 */
export async function applyMigrations(db: Db, directory: string): Promise<string[]> {
  await db.exec(createLedger);
  const recorded = await recordedChecksums(db);
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const filename of filenames) {
    const sql = await readFile(join(directory, filename), "utf8");
    const checksum = checksumOf(sql);
    const previousChecksum = recorded.get(filename);

    if (previousChecksum !== undefined) {
      if (previousChecksum !== checksum) {
        throw new Error(`Migration ${filename} was edited after it ran. Add a new file instead.`);
      }
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [
        filename,
        checksum,
      ]);
    });
    applied.push(filename);
  }

  return applied;
}
