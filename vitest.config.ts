import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          root: "apps/server",
          environment: "node",
          include: ["test/**/*.test.ts"],
          // These specs boot a database rather than call a function: PGlite starts a
          // PostgreSQL compiled to WebAssembly, and the real-driver run creates a
          // throwaway database per suite. The first test in a file pays about four
          // seconds of that on a warm laptop, which leaves nothing under the five-second
          // default on a shared CI runner.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "shared",
          root: "packages/shared",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "start",
          root: "scripts/start",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          root: "apps/web",
          environment: "jsdom",
          include: ["test/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "apps/server/src/**/*.ts",
        "apps/web/src/**/*.{ts,tsx}",
        "packages/shared/src/**/*.ts",
        "scripts/start/*.ts",
      ],
      // Process entry points wire the parts together and are covered by running the app, not by unit tests.
      exclude: ["apps/server/src/index.ts", "apps/web/src/main.tsx", "scripts/start/main.ts"],
      thresholds: { 100: true },
      reporter: ["text-summary"],
    },
  },
});
