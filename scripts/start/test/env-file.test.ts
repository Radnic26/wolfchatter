import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answers } from "../answers.ts";
import {
  planEnvFile,
  readDatabasePassword,
  readEnvFile,
  readPort,
  renderEnvFile,
  writeEnvFile,
} from "../env-file.ts";

const emptyDirectory = () => mkdtempSync(join(tmpdir(), "wolfchatter-env-"));

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

  it("names the directory the embedded database really writes to", () => {
    expect(renderEnvFile(answers({ mode: "embedded" }))).toContain("apps/server/data/pg");
  });
});

describe("readEnvFile", () => {
  it("reads back what was written there", () => {
    const path = join(emptyDirectory(), ".env");
    writeFileSync(path, "PORT=3000\n");

    expect(readEnvFile(path)).toBe("PORT=3000\n");
  });

  it("finds nothing on a first run, which is not an error", () => {
    expect(readEnvFile(join(emptyDirectory(), ".env"))).toBeUndefined();
  });
});

describe("writeEnvFile", () => {
  it("writes the contents it was given", () => {
    const path = join(emptyDirectory(), ".env");
    writeEnvFile(path, renderEnvFile(answers()));

    expect(readFileSync(path, "utf8")).toBe(renderEnvFile(answers()));
  });

  it("locks a file it did not create down to its owner", () => {
    const path = join(emptyDirectory(), ".env");
    writeFileSync(path, "PORT=3000\n", { mode: 0o644 });

    writeEnvFile(path, "PORT=8080\n");

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("leaves nothing half-written beside it", () => {
    const directory = emptyDirectory();
    writeEnvFile(join(directory, ".env"), "PORT=3000\n");

    expect(readdirSync(directory)).toEqual([".env"]);
  });
});

describe("planEnvFile", () => {
  it("writes the answers when there is no file yet", () => {
    expect(planEnvFile(false, false).writes).toBe(true);
  });

  it("keeps a file that is already there, and says the answers in it win", () => {
    const plan = planEnvFile(true, false);

    expect(plan.writes).toBe(false);
    expect(plan.notice).toContain("--reconfigure");
  });

  it("replaces the file only when it was asked to", () => {
    expect(planEnvFile(true, true).writes).toBe(true);
  });

  it("says a rewrite keeps the password, because an existing volume answers to no other", () => {
    expect(planEnvFile(true, true).notice).toContain("password");
  });

  it("says what it did either way", () => {
    for (const plan of [planEnvFile(false, false), planEnvFile(true, false), planEnvFile(true, true)]) {
      expect(plan.notice).not.toBe("");
    }
  });
});

describe("readDatabasePassword", () => {
  it("reads back the password the file was written with", () => {
    expect(readDatabasePassword(renderEnvFile(answers()))).toBe("example-password");
  });

  it("finds nothing when the file holds no database of its own", () => {
    expect(readDatabasePassword(renderEnvFile(answers({ mode: "embedded" })))).toBeUndefined();
  });

  it("finds nothing when there is no file at all", () => {
    expect(readDatabasePassword(undefined)).toBeUndefined();
  });
});

describe("readPort", () => {
  it("reads back the port the file was written with", () => {
    expect(readPort(renderEnvFile(answers({ port: 8080 })))).toBe(8080);
  });

  it("finds nothing when there is no file at all", () => {
    expect(readPort(undefined)).toBeUndefined();
  });

  it("refuses a port that is not one, rather than proxying to it", () => {
    expect(readPort("PORT=nonsense\n")).toBeUndefined();
    expect(readPort("PORT=99999\n")).toBeUndefined();
  });
});
