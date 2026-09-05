import { randomUUID } from "node:crypto";
import { MESSAGE_PAGE_SIZE, type Message } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RunningApi, startApi } from "../support/api.ts";
import { databasesUnderTest } from "../support/databases.ts";

const unknownRoomId = randomUUID();

/** Ids come from the client as random v4 uuids, so the fixtures use the same distribution. */
function posted(body: string) {
  return { id: randomUUID(), username: "radu", body };
}

describe.each(databasesUnderTest)("the messages API on $name", (database) => {
  let api: RunningApi;

  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api = await startApi(database);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await api?.db.close();
  });

  async function roomWith(count: number): Promise<{ roomId: string; sent: Message[] }> {
    const room = await api.createRoom();
    const sent: Message[] = [];
    for (let index = 0; index < count; index++) {
      const response = await api.post(`/api/rooms/${room.id}/messages`, posted(`message ${index}`));
      sent.push((await response.json()) as Message);
    }
    return { roomId: room.id, sent };
  }

  it("has no history in a room nobody wrote in", async () => {
    const room = await api.createRoom();

    const response = await api.request(`/api/rooms/${room.id}/messages`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("posts a message and returns it as stored", async () => {
    const room = await api.createRoom();
    const message = posted("hello");

    const response = await api.post(`/api/rooms/${room.id}/messages`, message);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: message.id,
      roomId: room.id,
      username: "radu",
      body: "hello",
    });
  });

  it("trims what the user typed around the edges", async () => {
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, {
      id: randomUUID(),
      username: "  radu  ",
      body: "  hello  ",
    });

    await expect(response.json()).resolves.toMatchObject({ username: "radu", body: "hello" });
  });

  it("keeps a burst of messages in the order it accepted them", async () => {
    const { roomId, sent } = await roomWith(50);

    const history = (await (await api.request(`/api/rooms/${roomId}/messages`)).json()) as Message[];

    expect(history.map((message) => message.body)).toEqual(sent.map((message) => message.body));
  });

  it("stores a message resent with the same id once and answers with the stored one", async () => {
    const room = await api.createRoom();
    const message = posted("hello");

    const first = await api.post(`/api/rooms/${room.id}/messages`, message);
    const retry = await api.post(`/api/rooms/${room.id}/messages`, message);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual(await first.json());
    await expect((await api.request(`/api/rooms/${room.id}/messages`)).json()).resolves.toHaveLength(1);
  });

  it("refuses an id already spent in another room", async () => {
    const first = await api.createRoom();
    const second = await api.createRoom();
    const message = posted("hello");
    await api.post(`/api/rooms/${first.id}/messages`, message);

    const response = await api.post(`/api/rooms/${second.id}/messages`, message);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "message_id_taken" } });
  });

  it("backfills exactly what the client missed", async () => {
    const { roomId, sent } = await roomWith(4);

    const missed = await (await api.request(`/api/rooms/${roomId}/messages?after=${sent[1]?.id}`)).json();

    expect(missed).toEqual(sent.slice(2));
  });

  it("backfills nothing when the client is up to date", async () => {
    const { roomId, sent } = await roomWith(2);

    const response = await api.request(`/api/rooms/${roomId}/messages?after=${sent.at(-1)?.id}`);

    await expect(response.json()).resolves.toEqual([]);
  });

  it("gives a reader of a busy room the newest messages", async () => {
    const { roomId, sent } = await roomWith(MESSAGE_PAGE_SIZE + 5);

    const page = (await (await api.request(`/api/rooms/${roomId}/messages`)).json()) as Message[];

    expect(page).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(page).toEqual(sent.slice(-MESSAGE_PAGE_SIZE));
    expect(page.map((message) => message.body)).not.toContain("message 0");
  });

  it("honours the page size it was asked for", async () => {
    const { roomId, sent } = await roomWith(3);

    const page = await (await api.request(`/api/rooms/${roomId}/messages?limit=2`)).json();

    expect(page).toEqual(sent.slice(-2));
  });

  it("refuses a cursor this room never held instead of looking up to date", async () => {
    const { roomId } = await roomWith(1);

    const response = await api.request(`/api/rooms/${roomId}/messages?after=${randomUUID()}`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_cursor" } });
  });

  it("refuses a cursor that belongs to another room", async () => {
    const { sent } = await roomWith(1);
    const other = await api.createRoom();

    const response = await api.request(`/api/rooms/${other.id}/messages?after=${sent[0]?.id}`);

    expect(response.status).toBe(400);
  });

  it.each([
    ["reading", "GET"],
    ["writing", "POST"],
  ])("answers 404 when %s a room that does not exist", async (_case, method) => {
    const path = `/api/rooms/${unknownRoomId}/messages`;

    const response = method === "GET" ? await api.request(path) : await api.post(path, posted("hello"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "room_not_found" } });
  });

  it.each([
    ["a room id that is not a uuid", "/api/rooms/1;DROP TABLE rooms/messages"],
    ["a cursor that is not a uuid", `/api/rooms/${unknownRoomId}/messages?after=latest`],
    ["a page size of zero", `/api/rooms/${unknownRoomId}/messages?limit=0`],
    ["a page size past the cap", `/api/rooms/${unknownRoomId}/messages?limit=100000`],
  ])("refuses %s", async (_case, path) => {
    const response = await api.request(path);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it.each([
    ["a message with no text", { id: randomUUID(), username: "radu", body: "   " }],
    ["a message with no author", { id: randomUUID(), username: "", body: "hello" }],
    ["a message with no id", { username: "radu", body: "hello" }],
    ["a username past 32 characters", { id: randomUUID(), username: "a".repeat(33), body: "hi" }],
    ["a body past 500 characters", { id: randomUUID(), username: "radu", body: "a".repeat(501) }],
    [
      "a timestamp the client chose",
      { id: randomUUID(), username: "radu", body: "hi", createdAt: "2000-01-01T00:00:00.000Z" },
    ],
  ])("refuses %s", async (_case, body) => {
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it("refuses a message past the payload cap", async () => {
    const room = await api.createRoom();

    const response = await api.post(`/api/rooms/${room.id}/messages`, {
      ...posted("hello"),
      padding: "x".repeat(17 * 1024),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("stores nothing when it refused the message", async () => {
    const room = await api.createRoom();

    await api.post(`/api/rooms/${room.id}/messages`, { id: randomUUID(), username: "", body: "hi" });

    await expect((await api.request(`/api/rooms/${room.id}/messages`)).json()).resolves.toEqual([]);
  });
});
