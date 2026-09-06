import { vi } from "vitest";

/** Declared rather than imported, for the reason `test/support/random-uuid.ts` gives. */
declare const setTimeout: (run: () => void, milliseconds: number) => unknown;

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

    /**
     * A browser answers `close()` with a closing handshake and delivers the close event
     * after the call has returned, which is what lets a client open a second socket before
     * the first one's event arrives. A double that fires it inline hides that entirely.
     */
    close(): void {
      this.closedByClient = true;
      setTimeout(() => this.onclose?.(), 0);
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
