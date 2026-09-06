import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db, Queryable } from "../src/db/db.ts";
import { allowedTestOrigin, appOver, type RunningApi, startApi } from "./support/api.ts";
import { embeddedDatabase, openMigratedDatabase } from "./support/databases.ts";

const emptyDatabase: Queryable = {
  query: async () => ({ rows: [] }),
  exec: async () => undefined,
};

const brokenDatabaseThrowing = (fault: unknown): Queryable => ({
  query: async () => {
    throw fault;
  },
  exec: async () => undefined,
});

describe("GET /api/health", () => {
  it("reports the server as ok", async () => {
    const response = await appOver(emptyDatabase).request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("the headers an API answer carries", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells a browser to trust the content type it was given rather than sniff one", async () => {
    const response = await appOver(emptyDatabase).request("/api/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses to be framed and keeps the page to its own origin", async () => {
    const response = await appOver(emptyDatabase).request("/api/health");

    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
  });

  it("lets the map load its tiles, the one origin the page reaches outward for", async () => {
    const response = await appOver(emptyDatabase).request("/api/health");

    expect(response.headers.get("content-security-policy")).toContain("https://tiles.stadiamaps.com");
  });

  it("asks for https for a year once a request has proved TLS terminates here", async () => {
    const response = await appOver(emptyDatabase).request("https://wolfchatter.example/api/health");

    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("asks a plain http caller for nothing, or a local run would pin localhost to https", async () => {
    const response = await appOver(emptyDatabase).request("http://localhost:3000/api/health");

    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  it("leaves the upgrade route bare, because a handshake does not survive a written header", async () => {
    const response = await appOver(emptyDatabase).request("/ws", { headers: { origin: allowedTestOrigin } });

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBeNull();
  });
});

describe("the origin a write arrives from", () => {
  let api: RunningApi;

  const openRoom = (headers: Record<string, string>) =>
    api.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ id: randomUUID(), lat: 46.7712, lng: 23.6236 }),
    });

  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api = await startApi(embeddedDatabase);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await api.db.close();
  });

  it("is refused when it is a page the server does not serve", async () => {
    const response = await openRoom({ origin: "https://evil.example" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", requestId: expect.any(String) },
    });
  });

  it("opens the room when the origin is one the allowlist names", async () => {
    const response = await openRoom({ origin: allowedTestOrigin });

    expect(response.status).toBe(201);
  });

  it("opens the room when there is no origin, which is how curl and the health check call", async () => {
    const response = await openRoom({});

    expect(response.status).toBe(201);
  });

  it("is not asked of a read, which changes nothing whoever sends it", async () => {
    const response = await api.request("/api/rooms", { headers: { origin: "https://evil.example" } });

    expect(response.status).toBe(200);
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
    const response = await appOver(emptyDatabase).request(path, method ? { method } : undefined);

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
    const database = brokenDatabaseThrowing(new Error('relation "rooms" does not exist'));

    const response = await appOver(database).request("/api/rooms");

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "internal_error", requestId: expect.any(String) } });
    expect(JSON.stringify(body)).not.toContain("rooms");
  });

  it("logs the cause against the request id it returned", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const database = brokenDatabaseThrowing(new Error("connection terminated unexpectedly"));

    const response = await appOver(database).request("/api/rooms");

    const { error } = (await response.json()) as { error: { requestId: string } };
    const line = logged.mock.calls.map(([text]) => String(text)).join("\n");
    expect(line).toContain(error.requestId);
    expect(line).toContain("connection terminated unexpectedly");
  });

  it("logs the stack, so the request id leads to the place the fault came from", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const database = brokenDatabaseThrowing(new Error("connection terminated unexpectedly"));

    await appOver(database).request("/api/rooms");

    // The throw above is the top frame, so the log names this file and the line it is on.
    expect(logged.mock.calls.map(([text]) => String(text)).join("\n")).toContain("app.test.ts");
  });

  it("logs what the fault says when the runtime gave it no stack at all", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stackless = new Error("connection terminated unexpectedly");
    stackless.stack = undefined;

    await appOver(brokenDatabaseThrowing(stackless)).request("/api/rooms");

    expect(logged.mock.calls.map(([text]) => String(text)).join("\n")).toContain(
      "Error: connection terminated unexpectedly",
    );
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

    const response = await appOver(db).request("/api/rooms");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
