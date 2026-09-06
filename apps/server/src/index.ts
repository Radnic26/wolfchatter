import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";
import { createApp, secureResponseHeaders } from "./app.ts";
import { createDb } from "./db/create-db.ts";
import { applyMigrations, migrationsDirectory } from "./db/migrate.ts";
import { seedSampleData } from "./db/seed.ts";
import { parseServerConfig } from "./env.ts";
import { clientAddress } from "./lib/client-address.ts";
import { networkOrigins, reachableOrigins } from "./lib/network-origins.ts";
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

if (config.SEED_SAMPLE_DATA) {
  const seeded = await seedSampleData(db);
  if (seeded > 0) console.log(`Seeded ${seeded} sample rooms, so the map opens with pins on it.`);
}

const sockets = createSocketServer();
const hub = createChatHub({ now: () => performance.now() });
sockets.on("connection", (socket) => hub.accept(socket));

// A phone on the same Wi-Fi reaches this by an address of its own, and both the write gate
// and the upgrade check Origin, so the addresses this host answers to are allowed alongside
// whatever ALLOWED_ORIGINS names.
const allowedOrigins = [...config.ALLOWED_ORIGINS, ...networkOrigins(networkInterfaces(), config.PORT)];

const app = createApp({
  db,
  broadcaster: hub,
  allowedOrigins,
  addressOf: (c) => clientAddress(c, config.TRUSTED_CLIENT_HEADER),
  now: () => performance.now(),
});

/** Vite fingerprints every name under `assets/`, so those files never change under one. */
const immutableForOneYear = "public, max-age=31536000, immutable";

/**
 * `serveStatic` has built its response by the time `onFound` runs and drops a header written
 * there, so the policy is set on the way in instead, where the response picks it up.
 */
function cacheStaticFor(policy: string): MiddlewareHandler {
  return async (c, next) => {
    c.header("Cache-Control", policy);
    await next();
  };
}

// In development the browser talks to Vite, which proxies here; in the container this is
// the only server, so it also hands out the built front end and falls back to the SPA shell.
// Anchored on this file rather than the working directory, which is `apps/server` under
// `npm run dev` and the repository root under Docker.
const webRoot = join(import.meta.dirname, "../../web/dist");

// None of this may reach `/ws`, and none of it does: the socket route is registered above
// and answers first, so a middleware that writes a header never runs on the upgrade.
app.use("/*", secureResponseHeaders);
// The bundle is built compressed and was being served raw, so a browser downloaded 451 KB
// of JavaScript for the 137 KB NFR-1 budgets. Fonts are already compressed and are left
// alone by the content-type filter; anything under the 1 KiB default is not worth a pass.
app.use("/*", compress());
app.use("/*", cacheStaticFor("no-cache"));
app.use("/assets/*", cacheStaticFor(immutableForOneYear));
app.use("/*", serveStatic({ root: webRoot }));
// The shell answers every deep link, an unknown `assets/` path included, so it takes the
// revalidating policy back off that path — or a deploy would go unnoticed for a year.
app.get("/*", cacheStaticFor("no-cache"), serveStatic({ path: join(webRoot, "index.html") }));

const server = serve({ fetch: app.fetch, port: config.PORT, websocket: { server: sockets } });
const heartbeat = setInterval(() => hub.sweepDeadConnections(), heartbeatMilliseconds);

console.log(`Wolfchatter API listening on http://localhost:${config.PORT}`);
// Printed here as well as by the wizard, because `docker compose up` is a documented way to
// start this and never sees the wizard at all. Only what was configured is offered: the
// addresses this process found on itself are the container's own inside one, and no phone
// can reach those — the wizard, out on the host, is what puts a real address in the file.
for (const origin of reachableOrigins(config.ALLOWED_ORIGINS, config.PORT)) {
  console.log(`  also reachable at ${origin} — same Wi-Fi, try it on a phone`);
}

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
