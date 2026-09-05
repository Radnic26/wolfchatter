import { vi } from "vitest";

/**
 * The socket the app opens, with the network taken out: it comes up on its own, so what a
 * spec drives is what arrives on it. The reconnect and the backfill are the shared client's
 * own business and have their spec there; this one is only how the app is wired to them.
 */
export interface StubbedSockets {
  /** Push a server frame onto the connection the app is holding. */
  deliver(frame: unknown): void;
  sent: unknown[];
  opened: number;
  closed: number;
}

export function stubWebSocket(): StubbedSockets {
  const sent: unknown[] = [];
  const counted = { opened: 0, closed: 0 };
  let receive: ((event: { data: unknown }) => void) | null = null;

  class ImmediateSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;

    constructor() {
      counted.opened += 1;
      queueMicrotask(() => {
        receive = this.onmessage;
        this.onopen?.();
      });
    }

    send(data: string): void {
      sent.push(JSON.parse(data));
    }

    close(): void {
      counted.closed += 1;
      this.onclose?.();
    }
  }

  vi.stubGlobal("WebSocket", ImmediateSocket);

  return {
    sent,
    get opened() {
      return counted.opened;
    },
    get closed() {
      return counted.closed;
    },
    deliver: (frame) => receive?.({ data: JSON.stringify(frame) }),
  };
}
