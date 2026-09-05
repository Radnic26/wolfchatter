import type { Answers } from "./answers.ts";
import { openStreetMapTiles } from "./tile-source.ts";

const databaseUser = "wolfchatter";
const databaseName = "wolfchatter";

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
  ];

  if (answers.mode === "embedded") {
    lines.push("", "# No DATABASE_URL: the server runs the embedded database in ./data/pg.");
  } else {
    lines.push("", `DATABASE_URL=${databaseUrl(answers)}`, `POSTGRES_PASSWORD=${answers.databasePassword}`);
  }

  lines.push("", ...tileLines(answers));

  return `${lines.join("\n")}\n`;
}
