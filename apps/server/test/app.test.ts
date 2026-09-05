import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { Queryable } from "../src/db/db.ts";
import { createPgliteDb } from "../src/db/pglite.ts";

const emptyDatabase: Queryable = {
  query: async () => ({ rows: [] }),
  exec: async () => undefined,
};

describe("GET /api/health", () => {
  it("reports the server as ok", async () => {
    const response = await createApp(emptyDatabase).request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not answer an unknown route", async () => {
    expect((await createApp(emptyDatabase).request("/api/nothing-here")).status).toBe(404);
  });
});

describe("an unexpected failure", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers with a generic body that names no cause", async () => {
    const brokenDatabase: Queryable = {
      query: async () => {
        throw new Error('relation "rooms" does not exist');
      },
      exec: async () => undefined,
    };

    const response = await createApp(brokenDatabase).request("/api/rooms");

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "internal_error", requestId: expect.any(String) } });
    expect(JSON.stringify(body)).not.toContain("rooms");
  });

  it("logs the cause against the request id it returned", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const brokenDatabase: Queryable = {
      query: async () => {
        throw new Error("connection terminated unexpectedly");
      },
      exec: async () => undefined,
    };

    const response = await createApp(brokenDatabase).request("/api/rooms");

    const { error } = (await response.json()) as { error: { requestId: string } };
    const line = logged.mock.calls.map(([text]) => String(text)).join("\n");
    expect(line).toContain(error.requestId);
    expect(line).toContain("connection terminated unexpectedly");
  });

  it("still serves a database that works", async () => {
    const db = createPgliteDb(new PGlite("memory://"));
    await db.exec(
      "CREATE TABLE rooms (id uuid, name text, lat float8, lng float8, created_at timestamptz, number int)",
    );

    const response = await createApp(db).request("/api/rooms");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    await db.close();
  });
});
