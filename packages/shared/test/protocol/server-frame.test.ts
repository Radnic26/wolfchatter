import { describe, expect, it } from "vitest";
import { parseServerFrame } from "../../src/protocol/index.ts";

const room = {
  id: "0199c0de-1234-7abc-8def-0123456789ab",
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
};

const message = {
  id: "0199c0de-2222-7abc-8def-0123456789ab",
  roomId: room.id,
  username: "radu",
  body: "hello",
  createdAt: "2026-09-05T10:00:01.000Z",
};

describe("parseServerFrame", () => {
  it("reads a new room announced to every map", () => {
    expect(parseServerFrame(JSON.stringify({ type: "room:created", room }))).toEqual({
      ok: true,
      frame: { type: "room:created", room },
    });
  });

  it("reads a new message announced to a room", () => {
    expect(parseServerFrame(JSON.stringify({ type: "message:created", message }))).toEqual({
      ok: true,
      frame: { type: "message:created", message },
    });
  });

  it("reads the answer to a heartbeat", () => {
    expect(parseServerFrame('{"type":"pong"}')).toEqual({ ok: true, frame: { type: "pong" } });
  });

  it("reads an error code the client can branch on", () => {
    expect(parseServerFrame('{"type":"error","code":"room_not_found"}')).toEqual({
      ok: true,
      frame: { type: "error", code: "room_not_found" },
    });
  });

  it.each([
    [
      "a room with a broken timestamp",
      JSON.stringify({ type: "room:created", room: { ...room, createdAt: "yesterday" } }),
    ],
    [
      "a message missing its room",
      JSON.stringify({ type: "message:created", message: { ...message, roomId: undefined } }),
    ],
    ["an error code outside the vocabulary", '{"type":"error","code":"kernel_panic"}'],
    ["a truncated frame", '{"type":"pong"'],
  ])("answers with an error code for %s", (_case, raw) => {
    expect(parseServerFrame(raw)).toEqual({ ok: false, code: "invalid_frame" });
  });
});
