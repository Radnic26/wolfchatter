import type { Message } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RunningApi, startApi } from "../support/api.ts";
import { databasesUnderTest } from "../support/databases.ts";

const unknownRoomId = "0199c0de-9999-7abc-8def-0123456789ab";

function messageId(suffix: string): string {
  return `0199c0de-${suffix}-7abc-8def-0123456789ab`;
}

describe.each(databasesUnderTest)("the messages API on $name", (database) => {
  let api: RunningApi;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await api.db.close();
  });

  async function roomWith(bodies: string[]): Promise<{ roomId: string; sent: Message[] }> {
    const room = await api.createRoom();
    const sent: Message[] = [];
    for (const [index, body] of bodies.entries()) {
      const response = await api.post(`/api/rooms/${room.id}/messages`, {
        id: messageId(String(3000 + index)),
        username: "radu",
        body,
      });
      sent.push((await response.json()) as Message);
    }
    return { roomId: room.id, sent };
  }

  it("has no history in a room nobody wrote in", async () => {
    api = await startApi(database);
    const room = await api.createRoom();

    const response = await api.request(`/api/rooms/${room.id}/messages`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("posts a message and returns it as stored", async () => {
    api = await startApi(database);
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, {
      id: messageId("1234"),
      username: "radu",
      body: "hello",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: messageId("1234"),
      roomId: room.id,
      username: "radu",
      body: "hello",
    });
  });

  it("trims what the user typed around the edges", async () => {
    api = await startApi(database);
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, {
      id: messageId("1234"),
      username: "  radu  ",
      body: "  hello  ",
    });

    await expect(response.json()).resolves.toMatchObject({ username: "radu", body: "hello" });
  });

  it("reads a room's history oldest first", async () => {
    api = await startApi(database);
    const { roomId, sent } = await roomWith(["first", "second", "third"]);

    const history = await (await api.request(`/api/rooms/${roomId}/messages`)).json();

    expect(history).toEqual(sent);
  });

  it("stores a message resent with the same id once and answers with the stored one", async () => {
    api = await startApi(database);
    const room = await api.createRoom();
    const posted = { id: messageId("1234"), username: "radu", body: "hello" };

    const first = await api.post(`/api/rooms/${room.id}/messages`, posted);
    const retry = await api.post(`/api/rooms/${room.id}/messages`, posted);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual(await first.json());
    await expect((await api.request(`/api/rooms/${room.id}/messages`)).json()).resolves.toHaveLength(1);
  });

  it("refuses an id already spent in another room", async () => {
    api = await startApi(database);
    const first = await api.createRoom();
    const second = await api.createRoom();
    const posted = { id: messageId("1234"), username: "radu", body: "hello" };
    await api.post(`/api/rooms/${first.id}/messages`, posted);

    const response = await api.post(`/api/rooms/${second.id}/messages`, posted);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "message_id_taken" } });
  });

  it("backfills exactly what the client missed", async () => {
    api = await startApi(database);
    const { roomId, sent } = await roomWith(["first", "second", "third", "fourth"]);

    const missed = await (await api.request(`/api/rooms/${roomId}/messages?after=${sent[1]?.id}`)).json();

    expect(missed).toEqual(sent.slice(2));
  });

  it("backfills nothing when the client is up to date", async () => {
    api = await startApi(database);
    const { roomId, sent } = await roomWith(["first", "second"]);

    const response = await api.request(`/api/rooms/${roomId}/messages?after=${sent.at(-1)?.id}`);

    await expect(response.json()).resolves.toEqual([]);
  });

  it("honours the page size it was asked for", async () => {
    api = await startApi(database);
    const { roomId, sent } = await roomWith(["first", "second", "third"]);

    const page = await (await api.request(`/api/rooms/${roomId}/messages?limit=2`)).json();

    expect(page).toEqual(sent.slice(0, 2));
  });

  it("refuses a cursor this room never held instead of looking up to date", async () => {
    api = await startApi(database);
    const { roomId } = await roomWith(["first"]);

    const response = await api.request(`/api/rooms/${roomId}/messages?after=${messageId("8888")}`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_cursor" } });
  });

  it("refuses a cursor that belongs to another room", async () => {
    api = await startApi(database);
    const { sent } = await roomWith(["first"]);
    const other = await api.createRoom();

    const response = await api.request(`/api/rooms/${other.id}/messages?after=${sent[0]?.id}`);

    expect(response.status).toBe(400);
  });

  it.each([
    ["reading", "GET"],
    ["writing", "POST"],
  ])("answers 404 when %s a room that does not exist", async (_case, method) => {
    api = await startApi(database);
    const path = `/api/rooms/${unknownRoomId}/messages`;

    const response =
      method === "GET"
        ? await api.request(path)
        : await api.post(path, { id: messageId("1234"), username: "radu", body: "hello" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "room_not_found" } });
  });

  it.each([
    ["a room id that is not a uuid", "/api/rooms/1;DROP TABLE rooms/messages"],
    ["a cursor that is not a uuid", `/api/rooms/${unknownRoomId}/messages?after=latest`],
    ["a page size of zero", `/api/rooms/${unknownRoomId}/messages?limit=0`],
    ["a page size past the cap", `/api/rooms/${unknownRoomId}/messages?limit=100000`],
  ])("refuses %s", async (_case, path) => {
    api = await startApi(database);

    const response = await api.request(path);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it.each([
    ["a message with no text", { id: messageId("1234"), username: "radu", body: "   " }],
    ["a message with no author", { id: messageId("1234"), username: "", body: "hello" }],
    ["a message with no id", { username: "radu", body: "hello" }],
    ["a username past 32 characters", { id: messageId("1234"), username: "a".repeat(33), body: "hi" }],
    ["a body past 500 characters", { id: messageId("1234"), username: "radu", body: "a".repeat(501) }],
    [
      "a timestamp the client chose",
      { id: messageId("1234"), username: "radu", body: "hi", createdAt: "2000-01-01T00:00:00.000Z" },
    ],
  ])("refuses %s", async (_case, body) => {
    api = await startApi(database);
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it("refuses a message past the payload cap", async () => {
    api = await startApi(database);
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, {
      id: messageId("1234"),
      username: "radu",
      body: "hello",
      padding: "x".repeat(17 * 1024),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("stores nothing when it refused the message", async () => {
    api = await startApi(database);
    const room = await api.createRoom();

    await api.post(`/api/rooms/${room.id}/messages`, { id: messageId("1234"), username: "", body: "hi" });

    await expect((await api.request(`/api/rooms/${room.id}/messages`)).json()).resolves.toEqual([]);
  });
});
