import { Hono } from "hono";

/** Routes stay chained on one instance so `hc<AppType>` can infer them in the web app. */
export const app = new Hono().get("/api/health", (c) => c.json({ status: "ok" as const }));

export type AppType = typeof app;
