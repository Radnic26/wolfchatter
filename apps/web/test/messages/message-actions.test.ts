import { randomUUID } from "node:crypto";
import { type ChatStore, createChatStore } from "@wolfchatter/shared/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeMessage, loadMessages, sendMessage } from "../../src/messages/message-actions.ts";

const roomId = randomUUID();

const storedMessage = (overrides: Partial<{ id: string; body: string }> = {}) => ({
  id: randomUUID(),
  roomId,
  username: "ana",
  body: "hello",
  createdAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

function answerWith(body: unknown, init: ResponseInit = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, init)),
  );
}

let store: ChatStore;

beforeEach(() => {
  store = createChatStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadMessages", () => {
  it("puts the room's history in the store as the server ordered it", async () => {
    const first = storedMessage({ body: "first" });
    const second = storedMessage({ body: "second" });
    answerWith([first, second]);

    await loadMessages(store, roomId);

    expect(store.getSnapshot().messagesByRoom.get(roomId)).toEqual([first, second]);
  });

  it("lets a failure through instead of leaving the room looking empty", async () => {
    answerWith({ error: { code: "room_not_found", requestId: "abc" } }, { status: 404 });

    await expect(loadMessages(store, roomId)).rejects.toThrow(/404/);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toBeUndefined();
  });
});

describe("composeMessage", () => {
  it("mints an id for the message, so a retry is stored once", () => {
    const composed = composeMessage(roomId, { username: "ana", body: "hello" });

    expect(composed.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(composeMessage(roomId, { username: "ana", body: "hello" }).id).not.toBe(composed.id);
  });

  it("belongs to the room it was written in, under the name and words it was written with", () => {
    expect(composeMessage(roomId, { username: "ana", body: "hello" })).toMatchObject({
      roomId,
      username: "ana",
      body: "hello",
    });
  });

  it("stamps it with this browser's clock, which the server's answer then replaces", () => {
    vi.setSystemTime(new Date("2026-09-05T10:00:00.000Z"));

    expect(composeMessage(roomId, { username: "ana", body: "hello" }).createdAt).toBe(
      "2026-09-05T10:00:00.000Z",
    );

    vi.useRealTimers();
  });
});

describe("sendMessage", () => {
  it("keeps the message the server stored, not the one that was composed", async () => {
    const composed = composeMessage(roomId, { username: "ana", body: "hello" });
    answerWith({ ...composed, createdAt: "2026-09-05T12:00:00.000Z" }, { status: 201 });

    await sendMessage(store, composed);

    expect(store.getSnapshot().messagesByRoom.get(roomId)?.[0]?.createdAt).toBe("2026-09-05T12:00:00.000Z");
  });

  it("remembers the name a message went through under", async () => {
    const composed = composeMessage(roomId, { username: "ana", body: "hello" });
    answerWith(composed, { status: 201 });

    await sendMessage(store, composed);

    expect(store.getSnapshot().username).toBe("ana");
  });

  it("neither stores the message nor remembers the name when the send fails", async () => {
    const composed = composeMessage(roomId, { username: "ana", body: "hello" });
    answerWith({ error: { code: "internal_error", requestId: "abc" } }, { status: 500 });

    await expect(sendMessage(store, composed)).rejects.toThrow(/500/);
    expect(store.getSnapshot().messagesByRoom.get(roomId)).toBeUndefined();
    expect(store.getSnapshot().username).toBe("");
  });
});
