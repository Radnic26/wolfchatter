import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.ts";
import { parseServerConfig } from "./env.ts";

const config = parseServerConfig(process.env);

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
    server.close(() => process.exit(0));
  });
}
