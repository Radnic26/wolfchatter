import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { type Answers, parsePortAnswer } from "./answers.ts";
import { openStreetMapTiles } from "./tile-source.ts";

const databaseUser = "wolfchatter";
const databaseName = "wolfchatter";

/**
 * Where PGlite writes its files. The server passes a path relative to its own workspace and
 * its dev script runs from there, so this is what to back up or delete from the repository
 * root — and it is the path `.env.example` documents.
 */
export const embeddedDatabaseDirectory = "apps/server/data/pg";

export type EnvFilePlan = {
  writes: boolean;
  notice: string;
};

/**
 * Rewriting an existing file costs more than it looks: PostgreSQL reads POSTGRES_PASSWORD
 * only while it initialises, so a fresh password locks the app out of a db-data volume that
 * is already there, and the tile lines or extra origins someone edited by hand go with it.
 */
export function planEnvFile(hasEnvFile: boolean, rewrites: boolean): EnvFilePlan {
  if (!hasEnvFile) return { writes: true, notice: "Writing .env from your answers, mode 0600." };
  if (rewrites) {
    return {
      writes: true,
      notice: "Rewriting .env, keeping any database password in it; a db-data volume answers to no other.",
    };
  }

  return {
    writes: false,
    notice: "Keeping the .env already here, so its port and tiles win; --reconfigure replaces it.",
  };
}

/** Missing is the ordinary state of a first run rather than a failure. */
export function readEnvFile(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * Mode 0600 is promised for the file whether or not the wizard created it, and a chmod after
 * the write would leave the password readable in between, so the mode goes on a temporary
 * file that is renamed over the old one: one atomic step, never a half-written .env.
 */
export function writeEnvFile(path: string, contents: string): void {
  const partialPath = `${path}.partial`;
  writeFileSync(partialPath, contents, { mode: 0o600 });
  renameSync(partialPath, path);
}

/** One setting of an env file, read back by name rather than by a pattern per key. */
function readSetting(envFile: string | undefined, key: string): string | undefined {
  const assignment = `${key}=`;
  const line = (envFile ?? "").split("\n").find((candidate) => candidate.startsWith(assignment));
  return line?.slice(assignment.length).trim();
}

/** The password a running db-data volume was created with; a rewrite carries it forward. */
export function readDatabasePassword(envFile: string | undefined): string | undefined {
  const password = readSetting(envFile, "POSTGRES_PASSWORD");
  return password === "" ? undefined : password;
}

/** The port a kept .env still dictates, so the URL the wizard prints is the one that serves. */
export function readPort(envFile: string | undefined): number | undefined {
  const port = readSetting(envFile, "PORT");
  return port === undefined ? undefined : parsePortAnswer(port);
}

/** Inside compose the app reaches PostgreSQL by service name; from the host, by published port. */
function databaseUrl(answers: Answers): string {
  const host = answers.mode === "docker" ? "db:5432" : "localhost:5432";
  return `postgres://${databaseUser}:${answers.databasePassword}@${host}/${databaseName}`;
}

/**
 * The web app already draws watercolour without being told, so the default costs no line
 * here; only the switch away from it does. The comment stays either way, because opening
 * the app on a phone by its address on the network is exactly when someone needs it.
 *
 * The attribution is single-quoted: it is HTML, its own attributes use double quotes, and
 * both Node's `--env-file` and Vite would otherwise stop the value at the first space.
 */
function tileLines(answers: Answers): string[] {
  if (answers.tiles === "watercolor") {
    return [
      "# Map tiles: watercolour via Stadia, which needs no key on localhost but answers 401",
      "# to any other host. To open the app from a phone on your network, uncomment these:",
      `# VITE_TILE_URL=${openStreetMapTiles.url}`,
      `# VITE_TILE_ATTRIBUTION='${openStreetMapTiles.attribution}'`,
    ];
  }

  return [
    "# Map tiles: OpenStreetMap, which never needs a key and works from any host.",
    `VITE_TILE_URL=${openStreetMapTiles.url}`,
    `VITE_TILE_ATTRIBUTION='${openStreetMapTiles.attribution}'`,
  ];
}

export function renderEnvFile(answers: Answers): string {
  const lines = [
    "# Written by ./start-wolfchatter. Git-ignored, mode 0600, safe to delete and regenerate.",
    `PORT=${answers.port}`,
    `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:${answers.port}`,
    "",
    "# A first run opens on a map with a few sample rooms on it. The server only ever seeds",
    "# a database with no rooms in it, so this line does nothing from the second boot on.",
    "SEED_SAMPLE_DATA=true",
  ];

  if (answers.mode === "embedded") {
    lines.push(
      "",
      `# No DATABASE_URL: the server runs the embedded database in ${embeddedDatabaseDirectory}.`,
    );
  } else {
    lines.push("", `DATABASE_URL=${databaseUrl(answers)}`, `POSTGRES_PASSWORD=${answers.databasePassword}`);
  }

  lines.push("", ...tileLines(answers));

  return `${lines.join("\n")}\n`;
}
