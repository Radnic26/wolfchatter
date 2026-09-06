import { WebSocket } from "ws";

export interface FleetOptions {
  baseUrl: string;
  origin: string;
  size: number;
  roomIds: readonly string[];
  /**
   * How many sockets time their deliveries. Every socket receives and is counted; only
   * these keep a sample, so the measuring process never becomes the bottleneck it measures.
   */
  observers: number;
  onDelivery(messageId: string, isObserver: boolean): void;
}

export interface Fleet {
  opened: number;
  refused: number;
  closedEarly(): number;
  socketErrors(): number;
  close(): void;
}

/**
 * The subscribed half of the load: N sockets spread evenly over the rooms. Every one comes
 * from `ws` rather than Node's global `WebSocket`, because the upgrade is refused without an
 * `Origin` and only this client can send one.
 */
export async function openFleet(options: FleetOptions): Promise<Fleet> {
  const url = `${options.baseUrl.replace(/^http/, "ws")}/ws`;
  const sockets: WebSocket[] = [];
  let refused = 0;
  let closedEarly = 0;
  let socketErrors = 0;
  let shuttingDown = false;

  const connections = Array.from({ length: options.size }, (_unused, index) => {
    const roomId = options.roomIds[index % options.roomIds.length];
    const isObserver = index < options.observers;

    return new Promise<void>((resolve) => {
      const socket = new WebSocket(url, { origin: options.origin });
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      socket.on("open", () => {
        sockets.push(socket);
        socket.send(JSON.stringify({ type: "subscribe", roomId }));
        settle();
      });

      socket.on("message", (data) => {
        const frame = String(data);
        // Parsing every frame on every socket is the sampler's own cost; the cheap test
        // first keeps it off the frames this run does not time.
        if (!frame.startsWith('{"type":"message:created"')) return;
        const parsed = JSON.parse(frame) as { message?: { id?: string } };
        if (parsed.message?.id !== undefined) options.onDelivery(parsed.message.id, isObserver);
      });

      socket.on("unexpected-response", () => {
        refused += 1;
        socket.terminate();
        settle();
      });
      socket.on("error", () => {
        socketErrors += 1;
        settle();
      });
      socket.on("close", () => {
        if (!shuttingDown) closedEarly += 1;
        settle();
      });
    });
  });

  await Promise.all(connections);

  return {
    opened: sockets.length,
    refused,
    closedEarly: () => closedEarly,
    socketErrors: () => socketErrors,
    close() {
      shuttingDown = true;
      for (const socket of sockets) socket.terminate();
    },
  };
}
