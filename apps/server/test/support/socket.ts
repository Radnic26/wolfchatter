import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseServerFrame, type ServerFrame } from "@wolfchatter/shared/protocol";
import { WebSocket } from "ws";
import { type ChatHub, createChatHub, type HubSocket } from "../../src/ws/hub.ts";
import { createSocketServer } from "../../src/ws/socket-server.ts";

/**
 * A reader that never drains and a peer that never answers a ping: neither is something a
 * socket on the loopback will do on request, and both are rules the hub has to keep.
 */
export interface SocketDouble extends HubSocket {
  sent: string[];
  queued: number;
  pings: number;
  terminated: boolean;
  fire(event: "pong" | "close" | "error"): void;
  deliver(data: string, isBinary?: boolean): void;
}

export function fakeSocket(): SocketDouble {
  const listeners = new Map<string, (...args: never[]) => void>();

  const socket: SocketDouble = {
    sent: [],
    queued: 0,
    pings: 0,
    terminated: false,
    get bufferedAmount() {
      return socket.queued;
    },
    send: (data) => void socket.sent.push(data),
    ping: () => {
      socket.pings += 1;
    },
    terminate: () => {
      socket.terminated = true;
    },
    on: (event: string, listener: (...args: never[]) => void) => listeners.set(event, listener),
    fire: (event) => (listeners.get(event) as (() => void) | undefined)?.(),
    deliver: (data, isBinary = false) =>
      (listeners.get("message") as ((data: unknown, isBinary: boolean) => void) | undefined)?.(
        Buffer.from(data),
        isBinary,
      ),
  };

  return socket;
}

export interface HubUnderTest {
  hub: ChatHub;
  /** The clock the frame allowance refills on, moved by the spec rather than by the machine. */
  advance(milliseconds: number): void;
  connect(): Promise<TestClient>;
  close(): Promise<void>;
}

export interface TestClient {
  socket: WebSocket;
  /** Every frame the server sent, parsed by the same schema the real client parses with. */
  received: ServerFrame[];
  send(frame: unknown): void;
  /** Settles when a frame the predicate accepts arrives, so no spec waits on a duration. */
  nextFrame(matches?: (frame: ServerFrame) => boolean): Promise<ServerFrame>;
  /**
   * Settles once everything sent before it has been handled: frames are processed in the
   * order they arrive, so a pong is proof that the subscribe ahead of it landed. Nothing in
   * these specs waits on a duration.
   */
  roundTrip(): Promise<void>;
  /** The close code the server ended with, so a spec names the reason rather than the timing. */
  closed: Promise<number>;
}

/**
 * The hub over the real socket server, so the frame cap and the compression setting under
 * test are the ones the process ships with. The upgrade is unconditional here: whether a
 * connection is allowed is the route's question, and it has its own spec.
 */
export async function startHub(): Promise<HubUnderTest> {
  let clock = 0;
  const sockets = createSocketServer();
  const hub = createChatHub({ now: () => clock });
  sockets.on("connection", (socket) => hub.accept(socket));

  const server = createServer();
  server.on("upgrade", (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (upgraded) => sockets.emit("connection", upgraded, request));
  });
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));

  const port = (server.address() as AddressInfo).port;
  const clients: TestClient[] = [];

  return {
    hub,
    advance: (milliseconds) => {
      clock += milliseconds;
    },

    async connect() {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const received: ServerFrame[] = [];
      const arrivals = new Set<(frame: ServerFrame) => void>();

      socket.on("message", (data) => {
        const parsed = parseServerFrame(data.toString());
        if (!parsed.ok) throw new Error(`the server sent a frame its own schema rejects: ${data}`);

        received.push(parsed.frame);
        for (const waiting of arrivals) waiting(parsed.frame);
      });

      const client: TestClient = {
        socket,
        received,
        send: (frame) => socket.send(typeof frame === "string" ? frame : JSON.stringify(frame)),
        nextFrame: (matches = () => true) =>
          new Promise<ServerFrame>((arrived) => {
            const held = received.find(matches);
            if (held) return arrived(held);

            const waiting = (frame: ServerFrame) => {
              if (!matches(frame)) return;
              arrivals.delete(waiting);
              arrived(frame);
            };
            arrivals.add(waiting);
          }),
        async roundTrip() {
          client.send({ type: "ping" });
          await client.nextFrame((frame) => frame.type === "pong");
        },
        closed: new Promise<number>((ended) => socket.on("close", (code) => ended(code))),
      };

      clients.push(client);
      await new Promise<void>((open) => socket.on("open", open));
      return client;
    },

    async close() {
      for (const client of clients) client.socket.terminate();
      sockets.close();
      await new Promise<void>((closed) => server.close(() => closed()));
    },
  };
}
