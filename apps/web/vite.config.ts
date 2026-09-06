import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The wizard writes one `.env` at the root of the repository, and Vite would otherwise look
// for it beside this file and silently find nothing.
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultApiPort = 3000;

export default defineConfig(({ mode }) => {
  // `npm run dev` starts Vite without loading `.env` into the environment, so the file the
  // wizard wrote is the only place the answered port exists.
  const { PORT } = loadEnv(mode, repositoryRoot, "PORT");
  const apiServer = `http://localhost:${PORT || defaultApiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    envDir: repositoryRoot,
    build: {
      rollupOptions: {
        output: {
          // Leaflet changes with its version and the app changes every day, so they are
          // cached apart. Not lazily loaded: `MapContainer` must never sit inside Suspense,
          // and the map is the first thing on the screen in any case.
          manualChunks: (id: string) => (/node_modules\/(react-)?leaflet\//.test(id) ? "leaflet" : undefined),
        },
      },
    },
    server: {
      // Proxying keeps the browser on one origin in development, so there is no CORS to configure.
      proxy: {
        "/api": apiServer,
        "/ws": { target: apiServer, ws: true },
      },
    },
  };
});
