import { vi } from "vitest";

/**
 * The socket the client is written against, with the runtime taken out: a spec decides when
 * it opens, what arrives on it and when it drops, so nothing here waits on a network.
 */
export interface FakeSocket {
  url: string;
  sent: unknown[];
  closedByClient: boolean;
  open(): void;
  deliver(frame: unknown): void;
  drop(): void;
}

export interface FakeSockets {
  opened: FakeSocket[];
  newest(): FakeSocket;
}

export function stubWebSocket(): FakeSockets {
  const opened: FakeSocket[] = [];

  class StubbedSocket implements FakeSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    sent: unknown[] = [];
    closedByClient = false;

    url: string;

    constructor(url: string) {
      this.url = url;
      opened.push(this);
    }

    send(data: string): void {
      this.sent.push(JSON.parse(data));
    }

    close(): void {
      this.closedByClient = true;
      this.onclose?.();
    }

    open(): void {
      this.onopen?.();
    }

    deliver(frame: unknown): void {
      this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
    }

    drop(): void {
      this.onclose?.();
    }
  }

  vi.stubGlobal("WebSocket", StubbedSocket);

  return {
    opened,
    newest() {
      const socket = opened.at(-1);
      if (!socket) throw new Error("the client has not opened a socket");
      return socket;
    },
  };
}
