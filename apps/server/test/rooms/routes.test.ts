import { randomUUID } from "node:crypto";
import type { Room } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { type RunningApi, startApi } from "../support/api.ts";
import { databasesUnderTest } from "../support/databases.ts";

const cluj = { lat: 46.7712, lng: 23.6236 };

function click(point = cluj) {
  return { id: randomUUID(), ...point };
}

describe.each(databasesUnderTest)("the rooms API on $name", (database) => {
  let api: RunningApi;
  let logged: MockInstance<typeof console.warn>;

  beforeEach(async () => {
    logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api = await startApi(database);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await api?.db.close();
  });

  it("starts with an empty map", async () => {
    const response = await api.request("/api/rooms");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("opens a chatroom where the map was clicked", async () => {
    const response = await api.post("/api/rooms", click());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ name: "Chatroom 1", ...cluj });
  });

  it("opens one room when a click is retried after a lost response", async () => {
    const gesture = click();

    const first = await api.post("/api/rooms", gesture);
    const retry = await api.post("/api/rooms", gesture);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual(await first.json());
    await expect((await api.request("/api/rooms")).json()).resolves.toHaveLength(1);
  });

  it("shows every room it created", async () => {
    await api.post("/api/rooms", click());
    await api.post("/api/rooms", click({ lat: 0, lng: 0 }));

    const rooms = (await (await api.request("/api/rooms")).json()) as Room[];

    expect(rooms.map((room) => room.name)).toEqual(["Chatroom 1", "Chatroom 2"]);
  });

  it("gives every room of a burst of clicks its own name", async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => api.post("/api/rooms", click())));
    const rooms = (await Promise.all(responses.map((response) => response.json()))) as Room[];

    expect(new Set(rooms.map((room) => room.name)).size).toBe(20);
  });

  it.each([
    ["a body that is not json", "{ not json"],
    ["a latitude past the pole", JSON.stringify(click({ lat: 91, lng: 0 }))],
    ["a longitude past the antimeridian", JSON.stringify(click({ lat: 0, lng: 181 }))],
    ["coordinates sent as text", JSON.stringify({ id: randomUUID(), lat: "46.77", lng: "23.62" })],
    ["a missing coordinate", JSON.stringify({ id: randomUUID(), lat: 46.77 })],
    ["a room without an id to retry under", JSON.stringify(cluj)],
    ["an empty body", ""],
    ["a name the client tried to choose", JSON.stringify({ ...click(), name: "Wolfpack HQ" })],
  ])("refuses %s", async (_case, body) => {
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
    const response = await api.request("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...click(), padding: "x".repeat(17 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("creates nothing when it refused the request", async () => {
    await api.post("/api/rooms", click({ lat: 91, lng: 0 }));

    await expect((await api.request("/api/rooms")).json()).resolves.toEqual([]);
  });

  it("keeps the reason out of the body and puts it in the log", async () => {
    const response = await api.post("/api/rooms", click({ lat: 91, lng: 0 }));

    // The body holds these two fields and nothing else, so no schema detail can ride along.
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body).toEqual({ error: { code: "invalid_request", requestId: expect.any(String) } });

    const reason = logged.mock.calls.map(([line]) => String(line)).join("\n");
    expect(reason).toContain(body.error.requestId);
    expect(reason).toContain("lat");
  });
});
