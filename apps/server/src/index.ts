import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { createDb } from "./db/create-db.ts";
import { applyMigrations, migrationsDirectory } from "./db/migrate.ts";
import { parseServerConfig } from "./env.ts";

const config = parseServerConfig(process.env);

// Without DATABASE_URL this is where the embedded database keeps its files, which is what
// a first run gets. The schema is brought up to date before the first request is served.
const db = createDb(config.DATABASE_URL, "./data/pg");
const applied = await applyMigrations(db, migrationsDirectory);
if (applied.length > 0) {
  console.log(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
}

const app = createApp(db);

// In development the browser talks to Vite, which proxies here; in the container this is
// the only server, so it also hands out the built front end and falls back to the SPA shell.
const webRoot = "./apps/web/dist";
app.use("/*", serveStatic({ root: webRoot }));
app.get("/*", serveStatic({ path: `${webRoot}/index.html` }));

const server = serve({ fetch: app.fetch, port: config.PORT });

console.log(`Wolfchatter API listening on http://localhost:${config.PORT}`);

// Containers stop with SIGTERM; a terminal sends SIGINT. Both must drain, not drop.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}
