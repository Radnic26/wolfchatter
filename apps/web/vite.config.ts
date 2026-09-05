import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiServer = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxying keeps the browser on one origin in development, so there is no CORS to configure.
    proxy: {
      "/api": apiServer,
      "/ws": { target: apiServer, ws: true },
    },
  },
});
