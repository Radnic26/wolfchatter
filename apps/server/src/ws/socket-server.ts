import { WebSocketServer } from "ws";

/**
 * The limits that hold before a frame is even read: a cap well above the 500 characters a
 * message may carry, and no compression, because a shared dictionary across frames is what
 * makes a socket a compression oracle and buys nothing on payloads this small.
 */
const maximumFrameBytes = 16 * 1024;

/** `noServer` because the HTTP server decides which upgrades reach here. */
export function createSocketServer(): WebSocketServer {
  return new WebSocketServer({
    noServer: true,
    maxPayload: maximumFrameBytes,
    perMessageDeflate: false,
  });
}
