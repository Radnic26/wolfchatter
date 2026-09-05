import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../../src/db/db.ts";
import { allowedTestOrigin, appOver } from "../support/api.ts";

const emptyDatabase: Queryable = {
  query: async () => ({ rows: [] }),
  exec: async () => undefined,
};

function upgradeRequest(headers: Record<string, string>) {
  return appOver(emptyDatabase).request("/ws", {
    headers: { connection: "Upgrade", upgrade: "websocket", ...headers },
  });
}

describe("the socket upgrade", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a page on another site, which is the whole point of the allowlist", async () => {
    const response = await upgradeRequest({ origin: "https://evil.example" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", requestId: expect.any(String) },
    });
  });

  it("refuses a handshake that carries no origin, rather than assuming it is friendly", async () => {
    const response = await upgradeRequest({});

    expect(response.status).toBe(403);
  });

  it("logs the origin it refused, so a real client blocked by configuration can be found", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await upgradeRequest({ origin: "https://evil.example" });

    expect(logged.mock.calls.map(([line]) => String(line)).join("\n")).toContain("https://evil.example");
  });

  it("lets an allowed origin past the guard, where a request that is no upgrade finds no route", async () => {
    const response = await appOver(emptyDatabase).request("/ws", { headers: { origin: allowedTestOrigin } });

    expect(response.status).toBe(404);
  });
});
