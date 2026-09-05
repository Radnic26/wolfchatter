import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../src/env.ts";

describe("parseServerConfig", () => {
  it("falls back to the embedded database and the Vite dev origin", () => {
    const config = parseServerConfig({});

    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.ALLOWED_ORIGINS).toEqual(["http://localhost:5173"]);
  });

  it("reads the port as a number", () => {
    expect(parseServerConfig({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("splits and trims the origin allowlist", () => {
    const config = parseServerConfig({ ALLOWED_ORIGINS: "https://wolfchatter.com, capacitor://localhost" });

    expect(config.ALLOWED_ORIGINS).toEqual(["https://wolfchatter.com", "capacitor://localhost"]);
  });

  it("keeps a database url when one is given", () => {
    const url = "postgres://wolfchatter:secret@db:5432/wolfchatter";

    expect(parseServerConfig({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("rejects a port outside the valid range", () => {
    expect(() => parseServerConfig({ PORT: "70000" })).toThrow(/Invalid environment/);
  });

  it("rejects a host and port that only look like a database url", () => {
    expect(() => parseServerConfig({ DATABASE_URL: "localhost:5432" })).toThrow(/Invalid environment/);
  });

  it("rejects a url that is not PostgreSQL", () => {
    expect(() => parseServerConfig({ DATABASE_URL: "mysql://u:p@db:3306/w" })).toThrow(/Invalid environment/);
  });

  it("rejects an allowlist with an empty entry", () => {
    expect(() => parseServerConfig({ ALLOWED_ORIGINS: "http://localhost:5173,," })).toThrow(
      /Invalid environment/,
    );
  });
});
