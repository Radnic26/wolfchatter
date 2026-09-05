import { describe, expect, it } from "vitest";
import { parseClientFrame } from "../../src/protocol/index.ts";

const roomId = "0199c0de-1234-7abc-8def-0123456789ab";

describe("parseClientFrame", () => {
  it("reads a subscription to a room", () => {
    expect(parseClientFrame(JSON.stringify({ type: "subscribe", roomId }))).toEqual({
      ok: true,
      frame: { type: "subscribe", roomId },
    });
  });

  it("reads an unsubscription", () => {
    expect(parseClientFrame(JSON.stringify({ type: "unsubscribe", roomId }))).toEqual({
      ok: true,
      frame: { type: "unsubscribe", roomId },
    });
  });

  it("reads a heartbeat", () => {
    expect(parseClientFrame('{"type":"ping"}')).toEqual({ ok: true, frame: { type: "ping" } });
  });

  it.each([
    ["text that is not json", "not json at all"],
    ["an unknown frame type", '{"type":"shutdown"}'],
    ["a subscription without a room", '{"type":"subscribe"}'],
    ["a room id that is not a uuid", '{"type":"subscribe","roomId":"../../etc/passwd"}'],
    ["a frame carrying an extra field", '{"type":"ping","admin":true}'],
    ["a json array", "[]"],
    ["an empty frame", ""],
  ])("answers with an error code for %s", (_case, raw) => {
    expect(parseClientFrame(raw)).toEqual({ ok: false, code: "invalid_frame" });
  });
});
