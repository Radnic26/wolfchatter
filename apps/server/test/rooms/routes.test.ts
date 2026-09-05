import type { Room } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { type RunningApi, startApi } from "../support/api.ts";
import { databasesUnderTest } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };

describe.each(databasesUnderTest)("the rooms API on $name", (database) => {
  let api: RunningApi;
  let logged: MockInstance<typeof console.warn>;

  beforeEach(() => {
    logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await api.db.close();
  });

  it("starts with an empty map", async () => {
    api = await startApi(database);

    const response = await api.request("/api/rooms");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("opens a chatroom where the map was clicked", async () => {
    api = await startApi(database);

    const response = await api.post("/api/rooms", cluj);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ name: "Chatroom 1", ...cluj });
  });

  it("shows every room it created", async () => {
    api = await startApi(database);
    await api.post("/api/rooms", cluj);
    await api.post("/api/rooms", { lat: 0, lng: 0 });

    const rooms = (await (await api.request("/api/rooms")).json()) as Room[];

    expect(rooms.map((room) => room.name)).toEqual(["Chatroom 1", "Chatroom 2"]);
  });

  it("gives every room of a burst of clicks its own name", async () => {
    api = await startApi(database);

    const responses = await Promise.all(Array.from({ length: 20 }, () => api.post("/api/rooms", cluj)));
    const rooms = (await Promise.all(responses.map((response) => response.json()))) as Room[];

    expect(new Set(rooms.map((room) => room.name)).size).toBe(20);
  });

  it.each([
    ["a body that is not json", "{ not json"],
    ["a latitude past the pole", JSON.stringify({ lat: 91, lng: 0 })],
    ["a longitude past the antimeridian", JSON.stringify({ lat: 0, lng: 181 })],
    ["coordinates sent as text", JSON.stringify({ lat: "46.77", lng: "23.62" })],
    ["a missing coordinate", JSON.stringify({ lat: 46.77 })],
    ["an empty body", ""],
    ["a name the client tried to choose", JSON.stringify({ ...cluj, name: "Wolfpack HQ" })],
  ])("refuses %s", async (_case, body) => {
    api = await startApi(database);

    const response = await api.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", requestId: expect.any(String) },
    });
  });

  it("refuses a body past the payload cap", async () => {
    api = await startApi(database);

    const response = await api.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...cluj, padding: "x".repeat(17 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("creates nothing when it refused the request", async () => {
    api = await startApi(database);

    await api.post("/api/rooms", { lat: 91, lng: 0 });

    await expect((await api.request("/api/rooms")).json()).resolves.toEqual([]);
  });

  it("keeps the reason out of the body and puts it in the log", async () => {
    api = await startApi(database);

    const response = await api.post("/api/rooms", { lat: 91, lng: 0 });

    // The body holds these two fields and nothing else, so no schema detail can ride along.
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body).toEqual({ error: { code: "invalid_request", requestId: expect.any(String) } });

    const reason = logged.mock.calls.map(([line]) => String(line)).join("\n");
    expect(reason).toContain(body.error.requestId);
    expect(reason).toContain("lat");
  });
});
