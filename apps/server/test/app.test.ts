import { describe, expect, it } from "vitest";
import { app } from "../src/app.ts";

describe("GET /api/health", () => {
  it("reports the server as ok", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not answer an unknown route", async () => {
    expect((await app.request("/api/nothing-here")).status).toBe(404);
  });
});
