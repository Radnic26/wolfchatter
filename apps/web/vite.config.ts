import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiServer = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The wizard writes one `.env` at the root of the repository, and Vite would otherwise
  // look for it beside this file and silently find nothing.
  envDir: "../../",
  server: {
    // Proxying keeps the browser on one origin in development, so there is no CORS to configure.
    proxy: {
      "/api": apiServer,
      "/ws": { target: apiServer, ws: true },
    },
  },
});
