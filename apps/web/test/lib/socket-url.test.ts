import { describe, expect, it } from "vitest";
import { socketUrl } from "../../src/lib/socket-url.ts";

describe("socketUrl", () => {
  it("opens the socket on the page's own origin, so there is nothing to configure", () => {
    expect(socketUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
  });

  it("follows a secure page onto a secure socket, which is the only kind it may open", () => {
    expect(socketUrl({ protocol: "https:", host: "wolfchatter.example" })).toBe(
      "wss://wolfchatter.example/ws",
    );
  });

  it("keeps the port the page was served on, which is where the proxy is listening", () => {
    expect(socketUrl({ protocol: "http:", host: "192.168.1.20:5173" })).toBe("ws://192.168.1.20:5173/ws");
  });
});
