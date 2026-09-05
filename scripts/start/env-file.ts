import type { Answers } from "./answers.ts";

const databaseUser = "wolfchatter";
const databaseName = "wolfchatter";

/** Inside compose the app reaches PostgreSQL by service name; from the host, by published port. */
function databaseUrl(answers: Answers): string {
  const host = answers.mode === "docker" ? "db:5432" : "localhost:5432";
  return `postgres://${databaseUser}:${answers.databasePassword}@${host}/${databaseName}`;
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

  return `${lines.join("\n")}\n`;
}
