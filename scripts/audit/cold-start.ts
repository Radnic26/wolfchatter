import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const usage = `Usage: node scripts/audit/cold-start.ts [options]

Times the production stack from \`docker compose up\` to the first 200 on /api/health, and
then the application on its own against a database that is already healthy. Both numbers
are wanted: the first is what someone waits for, and most of it is compose's healthcheck
interval rather than either process, which only the second makes visible.

The image must already be built — \`docker compose build\` — because a build is not start-up.
Every run destroys and recreates the database volume of the project it is given.

  --project <name>  the compose project to use (default wolfchatter)
  --runs <count>    how many times to repeat each measurement (default 3)
  --port <port>     where the application answers (default 3000)
  --help            print this
`;

const { values } = parseArgs({
  options: {
    project: { type: "string", default: "wolfchatter" },
    runs: { type: "string", default: "3" },
    port: { type: "string", default: "3000" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const runs = Number(values.runs);
const healthUrl = `http://localhost:${values.port}/api/health`;

function compose(...args: string[]): void {
  spawnSync("docker", ["compose", "-p", values.project, ...args], { stdio: "ignore" });
}

async function waitForHealth(): Promise<void> {
  for (;;) {
    const answered = await fetch(healthUrl)
      .then((response) => response.ok)
      .catch(() => false);
    if (answered) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Timed in this process rather than by shelling out to a clock, which would cost a spawn. */
async function timeToHealth(bringUp: () => void): Promise<number> {
  const started = performance.now();
  bringUp();
  await waitForHealth();
  return (performance.now() - started) / 1000;
}

function report(label: string, seconds: number[]): void {
  for (const [index, value] of seconds.entries()) {
    console.log(`  ${label} run ${index + 1}: ${value.toFixed(2)} s`);
  }
}

async function repeat(times: number, measure: () => Promise<number>): Promise<number[]> {
  const results: number[] = [];
  for (let run = 0; run < times; run += 1) results.push(await measure());
  return results;
}

function imageId(): string {
  const shown = spawnSync("docker", ["image", "inspect", `${values.project}-app`, "--format", "{{.Id}}"]);
  return shown.stdout.toString().trim().slice(0, 19) || "unknown";
}

function commit(): string {
  return spawnSync("git", ["rev-parse", "--short", "HEAD"]).stdout.toString().trim();
}

console.log("Start-up time, production image on a real PostgreSQL");
console.log(`date:   ${new Date().toISOString()}`);
console.log(`host:   ${process.platform} ${process.arch}, Node ${process.version}`);
console.log(`image:  ${imageId()} (built beforehand; the build is not timed)`);
console.log(`commit: ${commit()}\n`);

console.log("== whole stack: docker compose up on an empty database volume ==");
report(
  "cold",
  await repeat(runs, async () => {
    compose("down", "-v");
    return timeToHealth(() => compose("up", "-d"));
  }),
);

console.log("\n== whole stack: the same volume, containers restarted ==");
report(
  "warm",
  await repeat(runs, async () => {
    compose("down");
    return timeToHealth(() => compose("up", "-d"));
  }),
);

console.log(`
  Both are floored by docker-compose.yml's healthcheck: pg_isready runs on a 5 s interval
  and the app waits for the first pass, so ~5 s of either number is that interval rather
  than anything either process does.
`);

console.log("== application alone: PostgreSQL already healthy, empty schema, migrations at boot ==");
report(
  "app",
  await repeat(runs, async () => {
    compose("down", "-v");
    compose("up", "-d", "--wait", "db");
    return timeToHealth(() => compose("up", "-d", "app"));
  }),
);

compose("down", "-v");
