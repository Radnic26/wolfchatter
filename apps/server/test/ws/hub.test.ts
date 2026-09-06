import { randomUUID } from "node:crypto";
import type { Message, Room } from "@wolfchatter/shared/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeSocket, type HubUnderTest, startHub } from "../support/socket.ts";

const room = (): Room => ({
  id: randomUUID(),
  name: "Chatroom 1",
  lat: 46.7712,
  lng: 23.6236,
  createdAt: "2026-09-05T10:00:00.000Z",
});

const message = (roomId: string): Message => ({
  id: randomUUID(),
  roomId,
  username: "ana",
  body: "hello",
  createdAt: "2026-09-05T10:00:00.000Z",
});

describe("the chat hub over a real socket", () => {
  let hub: HubUnderTest;

  beforeEach(async () => {
    hub = await startHub();
  });

  afterEach(async () => {
    await hub.close();
  });

  it("sends a room's messages to whoever subscribed to it", async () => {
    const client = await hub.connect();
    const posted = message(randomUUID());

    client.send({ type: "subscribe", roomId: posted.roomId });
    await client.roundTrip();
    hub.hub.publishMessageCreated(posted);

    await expect(client.nextFrame((frame) => frame.type === "message:created")).resolves.toEqual({
      type: "message:created",
      message: posted,
    });
  });

  it("keeps a room's messages away from a connection that never asked for them", async () => {
    const listening = await hub.connect();
    const elsewhere = await hub.connect();
    const posted = message(randomUUID());

    listening.send({ type: "subscribe", roomId: posted.roomId });
    await listening.roundTrip();
    hub.hub.publishMessageCreated(posted);
    await listening.nextFrame((frame) => frame.type === "message:created");
    await elsewhere.roundTrip();

    expect(elsewhere.received.filter((frame) => frame.type === "message:created")).toEqual([]);
  });

  it("puts a new room on every map, because every map shows every pin", async () => {
    const first = await hub.connect();
    const second = await hub.connect();
    const opened = room();

    hub.hub.publishRoomCreated(opened);

    await expect(first.nextFrame()).resolves.toEqual({ type: "room:created", room: opened });
    await expect(second.nextFrame()).resolves.toEqual({ type: "room:created", room: opened });
  });

  it("stops sending a room's messages once it is unsubscribed", async () => {
    const client = await hub.connect();
    const posted = message(randomUUID());

    client.send({ type: "subscribe", roomId: posted.roomId });
    client.send({ type: "unsubscribe", roomId: posted.roomId });
    await client.roundTrip();
    hub.hub.publishMessageCreated(posted);
    await client.roundTrip();

    expect(client.received.filter((frame) => frame.type === "message:created")).toEqual([]);
  });

  it("answers a ping, which is how a client learns its own connection still carries", async () => {
    const client = await hub.connect();

    client.send({ type: "ping" });

    await expect(client.nextFrame()).resolves.toEqual({ type: "pong" });
  });

  it.each([
    ["text that is not JSON at all", "not json"],
    ["a frame outside the protocol", JSON.stringify({ type: "delete-everything" })],
    ["a subscription to something that is not a room id", JSON.stringify({ type: "subscribe", roomId: "1" })],
    ["a frame carrying a field the protocol does not have", JSON.stringify({ type: "ping", also: 1 })],
  ])("refuses %s and stays open", async (_case, raw) => {
    const client = await hub.connect();

    client.send(raw);

    await expect(client.nextFrame()).resolves.toEqual({ type: "error", code: "invalid_frame" });
    expect(client.socket.readyState).toBe(client.socket.OPEN);
  });

  it("refuses a binary frame, because the protocol is one JSON text frame per event", async () => {
    const client = await hub.connect();

    client.socket.send(Buffer.from(JSON.stringify({ type: "ping" })), { binary: true });

    await expect(client.nextFrame()).resolves.toEqual({ type: "error", code: "invalid_frame" });
  });

  it("closes a socket that sends more than the frame cap rather than reading it", async () => {
    const client = await hub.connect();

    client.send({ type: "subscribe", roomId: randomUUID(), padding: "x".repeat(17 * 1024) });

    await expect(client.closed).resolves.toBe(1009);
  });

  it("refuses frames from a connection that spends its allowance, and lets it back in", async () => {
    const client = await hub.connect();

    for (let sent = 0; sent < 21; sent += 1) client.send({ type: "ping" });
    await expect(client.nextFrame((frame) => frame.type === "error")).resolves.toEqual({
      type: "error",
      code: "rate_limited",
    });

    // The allowance refills with the clock, not with the machine: a second buys five frames.
    hub.advance(1000);
    client.send({ type: "ping" });

    await expect(client.nextFrame((frame) => frame.type === "pong")).resolves.toEqual({ type: "pong" });
  });
});

describe("the chat hub and a socket that misbehaves", () => {
  let hub: HubUnderTest;

  beforeEach(async () => {
    hub = await startHub();
  });

  afterEach(async () => {
    await hub.close();
  });

  it("pings every connection, and terminates whoever did not answer the round before", () => {
    const answering = fakeSocket();
    const silent = fakeSocket();
    hub.hub.accept(answering);
    hub.hub.accept(silent);

    hub.hub.sweepDeadConnections();
    answering.fire("pong");
    hub.hub.sweepDeadConnections();

    expect(silent.terminated).toBe(true);
    expect(answering.terminated).toBe(false);
    expect(answering.pings).toBe(2);
  });

  it("turns a broadcast into bytes once, however many sockets it goes to", () => {
    let namesRead = 0;
    // JSON.stringify reads every property of the frame exactly once per call, so counting
    // the reads of one of them counts the serialisations the fan-out paid for.
    const opened: Room = {
      ...room(),
      get name() {
        namesRead += 1;
        return "Chatroom 1";
      },
    };
    hub.hub.accept(fakeSocket());
    hub.hub.accept(fakeSocket());

    hub.hub.publishRoomCreated(opened);

    expect(namesRead).toBe(1);
  });

  it("drops a reader whose queue is longer than the fan-out is allowed to wait for", () => {
    const slow = fakeSocket();
    hub.hub.accept(slow);
    slow.queued = 1024 * 1024;

    hub.hub.publishRoomCreated(room());

    expect(slow.terminated).toBe(true);
    expect(slow.sent).toEqual([]);
  });

  it("sends nothing more to a reader it has dropped", () => {
    const slow = fakeSocket();
    hub.hub.accept(slow);
    slow.queued = 1024 * 1024;
    hub.hub.publishRoomCreated(room());

    slow.queued = 0;
    hub.hub.publishRoomCreated(room());

    expect(slow.sent).toEqual([]);
  });

  it("lets go of a socket that faults, because an unhandled error takes the process with it", () => {
    const faulty = fakeSocket();
    hub.hub.accept(faulty);

    faulty.fire("error");
    hub.hub.publishRoomCreated(room());

    expect(faulty.terminated).toBe(true);
    expect(faulty.sent).toEqual([]);
  });

  it("forgets a connection that closed, so a later broadcast does not reach for it", () => {
    const gone = fakeSocket();
    hub.hub.accept(gone);

    gone.fire("close");
    hub.hub.publishRoomCreated(room());

    expect(gone.sent).toEqual([]);
  });

  it("terminates every socket it holds when the process is shutting down", () => {
    const first = fakeSocket();
    const second = fakeSocket();
    hub.hub.accept(first);
    hub.hub.accept(second);

    hub.hub.close();

    expect([first.terminated, second.terminated]).toEqual([true, true]);
  });
});
