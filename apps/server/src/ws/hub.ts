import { parseClientFrame, type ServerFrame } from "@wolfchatter/shared/protocol";
import type { ErrorCode } from "@wolfchatter/shared/schema";
import type { RawData } from "ws";
import { createTokenBucket, type RateLimit, type TokenBucket } from "../lib/token-bucket.ts";
import type { Broadcaster } from "./broadcaster.ts";

/**
 * A reader the network cannot keep up with is a queue that grows for as long as the room
 * is busy. Past this much waiting to go out the connection is dropped; the client comes
 * back and asks for the gap, which is the recovery it already has for a lost connection.
 */
const maximumQueuedBytes = 512 * 1024;

/**
 * The socket carries subscriptions and a heartbeat, nothing that writes, so a client has
 * no honest reason to say much: a handful of frames when a room opens, one ping a minute.
 */
const frameLimit: RateLimit = { capacity: 20, refillPerSecond: 5 };

/**
 * The part of a `ws` socket the hub touches, named here rather than taken whole: a spec has
 * to be able to hand it a reader whose queue never drains and a peer that never answers a
 * ping, and a real socket on the loopback does neither.
 */
export interface HubSocket {
  readonly bufferedAmount: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): unknown;
  on(event: "pong" | "close" | "error", listener: () => void): unknown;
}

interface Connection {
  socket: HubSocket;
  rooms: Set<string>;
  frames: TokenBucket;
  answeredTheLastPing: boolean;
}

export interface ChatHub extends Broadcaster {
  /** A socket the upgrade has already authorised, from the moment `ws` hands it over. */
  accept(socket: HubSocket): void;
  /** One heartbeat round: terminate whoever missed the last one, then ping the rest. */
  sweepDeadConnections(): void;
  close(): void;
}

export interface ChatHubOptions {
  /** Monotonic, because the frame allowance is spent against it. */
  now: () => number;
}

export function createChatHub({ now }: ChatHubOptions): ChatHub {
  const connections = new Map<HubSocket, Connection>();

  function drop(connection: Connection): void {
    connections.delete(connection.socket);
    connection.socket.terminate();
  }

  function sendText(connection: Connection, text: string): void {
    if (connection.socket.bufferedAmount > maximumQueuedBytes) {
      drop(connection);
      return;
    }

    connection.socket.send(text);
  }

  function send(connection: Connection, frame: ServerFrame): void {
    sendText(connection, JSON.stringify(frame));
  }

  function fail(connection: Connection, code: ErrorCode): void {
    send(connection, { type: "error", code });
  }

  function receive(connection: Connection, data: RawData, isBinary: boolean): void {
    if (!connection.frames.take(now())) {
      fail(connection, "rate_limited");
      return;
    }

    // The protocol is one JSON text frame per event, so binary is not a frame this end has
    // any way to read — and reading it is exactly what an attacker would like it to try.
    if (isBinary) {
      fail(connection, "invalid_frame");
      return;
    }

    const parsed = parseClientFrame(data.toString());
    if (!parsed.ok) {
      fail(connection, parsed.code);
      return;
    }

    switch (parsed.frame.type) {
      case "subscribe":
        connection.rooms.add(parsed.frame.roomId);
        return;
      case "unsubscribe":
        connection.rooms.delete(parsed.frame.roomId);
        return;
      case "ping":
        send(connection, { type: "pong" });
        return;
    }
  }

  /** One fan-out, one serialisation: the frame is the same bytes for every recipient. */
  function publish(frame: ServerFrame, reaches: (connection: Connection) => boolean): void {
    const text = JSON.stringify(frame);
    for (const connection of connections.values()) {
      if (reaches(connection)) sendText(connection, text);
    }
  }

  return {
    accept(socket) {
      const connection: Connection = {
        socket,
        rooms: new Set(),
        frames: createTokenBucket(frameLimit, now()),
        answeredTheLastPing: true,
      };
      connections.set(socket, connection);

      socket.on("message", (data, isBinary) => receive(connection, data, isBinary));
      socket.on("pong", () => {
        connection.answeredTheLastPing = true;
      });
      socket.on("close", () => connections.delete(socket));
      // A socket that faults is gone whatever it says next, and an unhandled `error` on an
      // event emitter takes the process down with it.
      socket.on("error", () => drop(connection));
    },

    sweepDeadConnections() {
      for (const connection of connections.values()) {
        // Nothing came back from the last round, so the peer is gone even though this end
        // still holds an open socket. A close handshake would wait for the same silence.
        if (!connection.answeredTheLastPing) {
          drop(connection);
          continue;
        }

        connection.answeredTheLastPing = false;
        connection.socket.ping();
      }
    },

    /** Every map shows every pin, so a new room goes to everyone, subscribed or not. */
    publishRoomCreated(room) {
      publish({ type: "room:created", room }, () => true);
    },

    publishMessageCreated(message) {
      publish({ type: "message:created", message }, (connection) => connection.rooms.has(message.roomId));
    },

    /**
     * `http.Server.closeAllConnections()` leaves an upgraded socket alone, so a process that
     * only closes the server waits for readers that never leave. Shutdown is not a
     * negotiation either: the client's way back is to reconnect and ask for the gap.
     */
    close() {
      for (const connection of connections.values()) connection.socket.terminate();
      connections.clear();
    },
  };
}
