import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const wrapper = fileURLToPath(new URL("../../../start-wolfchatter", import.meta.url));

/**
 * The wrapper decides whether the Node on the PATH can run a TypeScript entry point at all,
 * so each case is a different `node` in front of the real one. A stub also keeps the wizard
 * itself from starting: whatever the wrapper execs is the stub.
 */
function runWrapperWith(node: string) {
  const directory = mkdtempSync(join(tmpdir(), "wolfchatter-node-"));
  writeFileSync(join(directory, "node"), node, { mode: 0o755 });

  return spawnSync("/bin/sh", [wrapper], {
    encoding: "utf8",
    env: { PATH: `${directory}:${process.env.PATH ?? ""}` },
  });
}

const nodeReporting = (version: string) =>
  `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; else echo "the wizard starts here"; fi\n`;

describe("start-wolfchatter", () => {
  it("starts the wizard on a Node new enough to strip the types", () => {
    const run = runWrapperWith(nodeReporting("v22.18.0"));

    expect(run.stdout).toContain("the wizard starts here");
    expect(run.status).toBe(0);
  });

  it("explains itself before the module loader can fail on an older Node", () => {
    const run = runWrapperWith(nodeReporting("v20.20.2"));

    expect(run.stderr).toContain("Wolfchatter needs Node 22.18 or newer; this is v20.20.2.");
    expect(run.stdout).not.toContain("the wizard starts here");
    expect(run.status).toBe(1);
  });

  it("names the version it needs when node cannot be run at all", () => {
    const run = runWrapperWith("#!/bin/sh\nexit 127\n");

    expect(run.stderr).toContain("Node 22.18 or newer");
    expect(run.status).toBe(1);
  });

  it("refuses a version it cannot read rather than guessing at it", () => {
    const run = runWrapperWith(nodeReporting("wolf"));

    expect(run.stderr).toContain("Node 22.18 or newer");
    expect(run.status).toBe(1);
  });
});
