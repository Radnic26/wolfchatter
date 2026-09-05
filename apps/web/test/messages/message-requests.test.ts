import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMessages, postMessage } from "../../src/messages/message-requests.ts";

const roomId = randomUUID();

const storedMessage = {
  id: randomUUID(),
  roomId,
  username: "ana",
  body: "hello",
  createdAt: "2026-09-05T10:00:00.000Z",
};

function answerWith(body: unknown, init: ResponseInit = {}): ReturnType<typeof vi.fn> {
  const fetching = vi.fn(async () => Response.json(body, init));
  vi.stubGlobal("fetch", fetching);
  return fetching;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMessages", () => {
  it("asks the room's own history, and asks for the newest page by sending no cursor", async () => {
    const fetching = answerWith([storedMessage]);

    await fetchMessages(roomId);

    expect(String(fetching.mock.calls[0]?.[0])).toBe(`/api/rooms/${roomId}/messages`);
  });

  it("returns the messages in the order the server sent them", async () => {
    const older = { ...storedMessage, id: randomUUID(), body: "older" };
    answerWith([older, storedMessage]);

    expect((await fetchMessages(roomId)).map((message) => message.body)).toEqual(["older", "hello"]);
  });

  it("refuses a body that is not a list of messages, rather than rendering nonsense", async () => {
    answerWith([{ id: storedMessage.id, body: "hello" }]);

    await expect(fetchMessages(roomId)).rejects.toThrow();
  });

  it("fails loudly when the room is not there", async () => {
    answerWith({ error: { code: "room_not_found", requestId: "abc" } }, { status: 404 });

    await expect(fetchMessages(roomId)).rejects.toThrow(/404/);
  });
});

describe("postMessage", () => {
  it("posts the message to its room under the id the caller minted", async () => {
    const fetching = answerWith(storedMessage, { status: 201 });
    const posted = { id: storedMessage.id, username: "ana", body: "hello" };

    await postMessage(roomId, posted);

    const [url, request] = fetching.mock.calls[0] ?? [];
    expect(String(url)).toBe(`/api/rooms/${roomId}/messages`);
    expect((request as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((request as RequestInit).body))).toEqual(posted);
  });

  it("returns the stored message, whose timestamp is the server's and not the sender's", async () => {
    answerWith(storedMessage, { status: 201 });

    expect(await postMessage(roomId, { id: storedMessage.id, username: "ana", body: "hello" })).toEqual(
      storedMessage,
    );
  });

  it("accepts the message a retry finds already stored, which the server answers with 200", async () => {
    answerWith(storedMessage, { status: 200 });

    expect(await postMessage(roomId, { id: storedMessage.id, username: "ana", body: "hello" })).toEqual(
      storedMessage,
    );
  });

  it("fails loudly when the id was already spent in another room", async () => {
    answerWith({ error: { code: "message_id_taken", requestId: "abc" } }, { status: 409 });

    await expect(
      postMessage(roomId, { id: storedMessage.id, username: "ana", body: "hello" }),
    ).rejects.toThrow(/409/);
  });
});
