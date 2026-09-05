import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db, Queryable } from "../src/db/db.ts";
import { embeddedDatabase, openMigratedDatabase } from "./support/databases.ts";

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
});

describe("a request that matches no route", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["an unknown endpoint", "/api/nothing-here", undefined],
    ["a method the route does not serve", "/api/rooms", "DELETE"],
    ["a path outside the api", "/nothing-here", undefined],
  ])("answers %s with the error shape every client parses", async (_case, path, method) => {
    const response = await createApp(emptyDatabase).request(path, method ? { method } : undefined);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", requestId: expect.any(String) },
    });
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
});

describe("the app over the real schema", () => {
  let db: Db;

  afterEach(async () => {
    await db?.close();
  });

  it("serves an empty map from a freshly migrated database", async () => {
    // The migrations are the schema, so the app is exercised against them rather than
    // against a table hand-written to match.
    db = await openMigratedDatabase(embeddedDatabase);

    const response = await createApp(db).request("/api/rooms");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
