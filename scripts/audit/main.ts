import { parseArgs } from "node:util";
import { headerProbes } from "./header-probes.ts";
import { httpProbes, openProbeRoom } from "./http-probes.ts";
import { limitProbes } from "./limit-probes.ts";
import type { Probe, Target } from "./probe.ts";
import { socketProbes } from "./socket-probes.ts";

const usage = `Usage: node scripts/audit/main.ts [options]

Sends every bad-input class NFR-2 names at a running Wolfchatter and reports what came back.
The application must already be up; the audit runs it under docker compose, because the
numbers have to describe the production image.

  --base <url>            where the application answers (default http://localhost:3000)
  --origin <origin>       an origin on the server's allowlist (default the base URL's own)
  --client-header <name>  the TRUSTED_CLIENT_HEADER the stack under test reads, if any
  --only <name>           run one probe by name
  --json                  print the verdicts as JSON, for docs/audit/raw/
  --help                  print this
`;

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    origin: { type: "string" },
    "client-header": { type: "string" },
    only: { type: "string" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const target: Target = {
  baseUrl: values.base.replace(/\/$/, ""),
  origin: values.origin ?? new URL(values.base).origin,
  clientHeader: values["client-header"],
};

const roomId = await openProbeRoom(target);
const everyProbe: Probe[] = [
  ...headerProbes(),
  ...httpProbes(roomId),
  ...socketProbes(roomId),
  // Last, and only last: it is the one probe that empties an allowance the others spend.
  ...limitProbes(),
];

const selected =
  values.only === undefined ? everyProbe : everyProbe.filter((probe) => probe.name === values.only);
if (selected.length === 0) {
  console.error(`No probe named ${values.only}. Known: ${everyProbe.map((probe) => probe.name).join(", ")}`);
  process.exit(64);
}

const verdicts = [];
for (const probe of selected) {
  const started = performance.now();
  const result = await probe.run(target);
  const milliseconds = Math.round(performance.now() - started);
  verdicts.push({
    probe: probe.name,
    control: probe.control,
    expectation: probe.expectation,
    held: result.held,
    observed: result.observed,
    milliseconds,
  });

  if (!values.json) {
    console.log(`${result.held ? "held  " : "MISSED"}  ${probe.name.padEnd(24)} ${result.observed}`);
  }
}

const missed = verdicts.filter((verdict) => !verdict.held);

if (values.json) {
  console.log(JSON.stringify({ target: target.baseUrl, roomId, verdicts }, null, 2));
} else {
  console.log(`\n${verdicts.length - missed.length}/${verdicts.length} controls held.`);
  for (const verdict of missed) console.log(`  missed: ${verdict.probe} (${verdict.control})`);
}

// A missed control is what the audit exists to find, so the exit code says so and the shell
// around it can stop pretending the run was clean.
process.exit(missed.length === 0 ? 0 : 1);
