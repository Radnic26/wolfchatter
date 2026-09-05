import { performance } from "node:perf_hooks";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { createDb } from "./db/create-db.ts";
import { applyMigrations, migrationsDirectory } from "./db/migrate.ts";
import { parseServerConfig } from "./env.ts";
import { clientAddress } from "./lib/client-address.ts";
import { createChatHub } from "./ws/hub.ts";
import { createSocketServer } from "./ws/socket-server.ts";

const heartbeatMilliseconds = 30_000;

const config = parseServerConfig(process.env);

// Without DATABASE_URL this is where the embedded database keeps its files, which is what
// a first run gets. The schema is brought up to date before the first request is served.
const db = createDb(config.DATABASE_URL, "./data/pg");
const applied = await applyMigrations(db, migrationsDirectory);
if (applied.length > 0) {
  console.log(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
}

const sockets = createSocketServer();
const hub = createChatHub({ now: () => performance.now() });
sockets.on("connection", (socket) => hub.accept(socket));

const app = createApp({
  db,
  broadcaster: hub,
  allowedOrigins: config.ALLOWED_ORIGINS,
  addressOf: clientAddress,
  now: () => performance.now(),
});

// In development the browser talks to Vite, which proxies here; in the container this is
// the only server, so it also hands out the built front end and falls back to the SPA shell.
const webRoot = "./apps/web/dist";
app.use("/*", serveStatic({ root: webRoot }));
app.get("/*", serveStatic({ path: `${webRoot}/index.html` }));

const server = serve({ fetch: app.fetch, port: config.PORT, websocket: { server: sockets } });
const heartbeat = setInterval(() => hub.sweepDeadConnections(), heartbeatMilliseconds);

console.log(`Wolfchatter API listening on http://localhost:${config.PORT}`);

// Containers stop with SIGTERM; a terminal sends SIGINT. Both must drain, not drop — and an
// upgraded socket is not something `server.close()` reaches, so the hub goes first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    clearInterval(heartbeat);
    hub.close();
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}
