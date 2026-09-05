import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../../src/db/db.ts";
import { appOver } from "../support/api.ts";

const emptyDatabase: Queryable = {
  query: async () => ({ rows: [] }),
  exec: async () => undefined,
};

const writeAllowance = 40;

/**
 * The limit runs before the body is read, so these writes never need a database: what is
 * counted is the attempt. The clock is the spec's, because how many requests a machine
 * fits into a second is a property of the machine.
 */
function apiFor(callers: string[], clock: { at: number }) {
  const remaining = [...callers];
  return appOver(emptyDatabase, {
    addressOf: () => remaining.shift() ?? "unexpected caller",
    now: () => clock.at,
  });
}

async function write(app: ReturnType<typeof apiFor>) {
  return app.request("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: randomUUID(), lat: 46.7712, lng: 23.6236 }),
  });
}

describe("the per-caller write limit", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a caller that writes past its allowance, in the shape every client parses", async () => {
    const clock = { at: 0 };
    const app = apiFor(
      Array.from({ length: writeAllowance + 1 }, () => "203.0.113.7"),
      clock,
    );
    for (let written = 0; written < writeAllowance; written += 1) await write(app);

    const refused = await write(app);

    expect(refused.status).toBe(429);
    await expect(refused.json()).resolves.toEqual({
      error: { code: "rate_limited", requestId: expect.any(String) },
    });
  });

  it("lets the caller write again once its allowance has come back", async () => {
    const clock = { at: 0 };
    const app = apiFor(
      Array.from({ length: writeAllowance + 2 }, () => "203.0.113.7"),
      clock,
    );
    for (let written = 0; written < writeAllowance + 1; written += 1) await write(app);

    clock.at = 1000;

    expect((await write(app)).status).not.toBe(429);
  });

  it("does not let one caller spend the allowance of the next", async () => {
    const clock = { at: 0 };
    const app = apiFor(
      [...Array.from({ length: writeAllowance }, () => "203.0.113.7"), "198.51.100.4"],
      clock,
    );
    for (let written = 0; written < writeAllowance; written += 1) await write(app);

    expect((await write(app)).status).not.toBe(429);
  });

  it("leaves reading alone, because a map that will not load is not a protection", async () => {
    const clock = { at: 0 };
    const app = apiFor([], clock);

    for (let read = 0; read < writeAllowance + 1; read += 1) {
      expect((await app.request("/api/rooms")).status).toBe(200);
    }
  });
});
