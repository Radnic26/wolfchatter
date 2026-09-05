import { describe, expect, it } from "vitest";
import type { Answers } from "../answers.ts";
import { renderEnvFile } from "../env-file.ts";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  mode: "docker",
  port: 3000,
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

  it("ends with a newline, so appending to it cannot corrupt the last line", () => {
    expect(renderEnvFile(answers()).endsWith("\n")).toBe(true);
  });
});
