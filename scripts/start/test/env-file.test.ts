import { describe, expect, it } from "vitest";
import type { Answers } from "../answers.ts";
import { renderEnvFile } from "../env-file.ts";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  mode: "docker",
  port: 3000,
  tiles: "watercolor",
  databasePassword: "example-password",
  ...overrides,
});

describe("renderEnvFile", () => {
  it("reaches PostgreSQL by service name when the app runs inside compose", () => {
    expect(renderEnvFile(answers({ mode: "docker" }))).toContain(
      "DATABASE_URL=postgres://wolfchatter:example-password@db:5432/wolfchatter",
    );
  });

  it("reaches PostgreSQL on localhost when only the database is in Docker", () => {
    expect(renderEnvFile(answers({ mode: "docker-database" }))).toContain(
      "DATABASE_URL=postgres://wolfchatter:example-password@localhost:5432/wolfchatter",
    );
  });

  it("writes no DATABASE_URL for the embedded database, and says why", () => {
    const rendered = renderEnvFile(answers({ mode: "embedded" }));

    expect(rendered).not.toContain("DATABASE_URL=");
    expect(rendered).toContain("embedded database");
  });

  it("passes the same password to compose so both sides agree", () => {
    expect(renderEnvFile(answers())).toContain("POSTGRES_PASSWORD=example-password");
  });

  it("keeps no password around when there is no database container", () => {
    expect(renderEnvFile(answers({ mode: "embedded" }))).not.toContain("example-password");
  });

  it("allows the Vite origin and the server's own port", () => {
    expect(renderEnvFile(answers({ port: 8080 }))).toContain(
      "ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080",
    );
  });

  it("writes the chosen port", () => {
    expect(renderEnvFile(answers({ port: 8080 }))).toContain("PORT=8080");
  });

  it("leaves the watercolour default unset, and shows the way off it", () => {
    const rendered = renderEnvFile(answers({ tiles: "watercolor" }));

    expect(rendered).not.toMatch(/^VITE_TILE_URL=/m);
    expect(rendered).toContain("# VITE_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("writes the OpenStreetMap tiles when they were chosen", () => {
    const rendered = renderEnvFile(answers({ tiles: "osm" }));

    expect(rendered).toContain("VITE_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(rendered).not.toMatch(/^# VITE_TILE_URL=/m);
  });

  it("quotes the attribution, whose own HTML attributes would end the value early", () => {
    const attribution = renderEnvFile(answers({ tiles: "osm" }))
      .split("\n")
      .find((line) => line.startsWith("VITE_TILE_ATTRIBUTION="));

    expect(attribution).toBe(
      `VITE_TILE_ATTRIBUTION='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`,
    );
  });

  it("ends with a newline, so appending to it cannot corrupt the last line", () => {
    expect(renderEnvFile(answers()).endsWith("\n")).toBe(true);
  });
});
