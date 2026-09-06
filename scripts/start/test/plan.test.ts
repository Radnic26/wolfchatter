import { describe, expect, it } from "vitest";
import type { Answers } from "../answers.ts";
import { planStart } from "../plan.ts";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  mode: "docker",
  port: 3000,
  networkAddresses: [],
  databasePassword: "example-password",
  ...overrides,
});

describe("planStart", () => {
  it("builds and runs the production stack, served on the server's own port", () => {
    const plan = planStart(answers({ mode: "docker", port: 8080 }));

    expect(plan.commands).toEqual([["docker", "compose", "up", "--build"]]);
    expect(plan.url).toBe("http://localhost:8080");
    expect(plan.reloads).toBe(false);
  });

  it("waits for the database to be healthy before the dev servers race its first boot", () => {
    const plan = planStart(answers({ mode: "docker-database" }));

    expect(plan.commands).toEqual([
      ["docker", "compose", "up", "--detach", "--wait", "db"],
      ["npm", "run", "dev"],
    ]);
    expect(plan.url).toBe("http://localhost:5173");
    expect(plan.reloads).toBe(true);
  });

  it("runs nothing but the dev servers for the embedded database", () => {
    const plan = planStart(answers({ mode: "embedded" }));

    expect(plan.commands).toEqual([["npm", "run", "dev"]]);
    expect(plan.url).toBe("http://localhost:5173");
    expect(plan.reloads).toBe(true);
  });

  it("never asks for Docker in the embedded mode", () => {
    const plan = planStart(answers({ mode: "embedded" }));

    expect(plan.commands.flat()).not.toContain("docker");
  });
});
