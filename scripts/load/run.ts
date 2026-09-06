import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseArgs, promisify } from "node:util";
import { writeMessages } from "./message-writer.ts";
import { summarise } from "./percentiles.ts";
import { openFleet } from "./socket-fleet.ts";

const runCommand = promisify(execFile);

const usage = `Usage: node scripts/load/run.ts [options]

Opens N sockets subscribed across R rooms and posts M messages a second over HTTP, then
reports the error rate, the latency from POST to the frame arriving on a subscribed socket,
and the container's memory. NFR-3's ten times is 500 sockets and 50 messages a second.

  --sockets <n>           subscribed sockets (default 50)
  --rooms <n>             rooms to spread them over (default 5)
  --rate <n>              messages a second (default 5)
  --seconds <n>           how long to post for (default 60)
  --base <url>            where the application answers (default http://localhost:3000)
  --origin <origin>       an origin on the server's allowlist (default the base URL's own)
  --client-header <name>  the TRUSTED_CLIENT_HEADER the stack reads, so the run speaks as
                          many callers rather than one; without it the per-IP write limit
                          is what gets measured
  --stats-container <id>  a container to sample memory from with docker stats
  --label <name>          what to call this run in the output
  --json                  print the result as JSON, for docs/audit/raw/
  --help                  print this
`;

const { values } = parseArgs({
  options: {
    sockets: { type: "string", default: "50" },
    rooms: { type: "string", default: "5" },
    rate: { type: "string", default: "5" },
    seconds: { type: "string", default: "60" },
    base: { type: "string", default: "http://localhost:3000" },
    origin: { type: "string" },
    "client-header": { type: "string" },
    "stats-container": { type: "string" },
    label: { type: "string", default: "run" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const baseUrl = values.base.replace(/\/$/, "");
const origin = values.origin ?? new URL(values.base).origin;
const clientHeader = values["client-header"];
const socketCount = Number(values.sockets);
const roomCount = Number(values.rooms);
const messagesPerSecond = Number(values.rate);
const seconds = Number(values.seconds);
const observers = Math.min(socketCount, 25);

const log = (line: string) => {
  if (!values.json) console.log(line);
};

async function memoryOfContainer(): Promise<string | undefined> {
  if (values["stats-container"] === undefined) return undefined;
  const { stdout } = await runCommand("docker", [
    "stats",
    "--no-stream",
    "--format",
    "{{.MemUsage}}",
    values["stats-container"],
  ]);
  return stdout.trim();
}

async function openRooms(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = randomUUID();
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(clientHeader === undefined ? {} : { [clientHeader]: `10.200.0.${index % 250}` }),
      },
      body: JSON.stringify({ id, lat: (index % 80) - 40, lng: (index % 170) - 85 }),
    });
    if (!response.ok) throw new Error(`could not open room ${index}: ${response.status}`);
    await response.body?.cancel();
    ids.push(id);
  }
  return ids;
}

log(`Opening ${roomCount} room(s)…`);
const roomIds = await openRooms(roomCount);

const postedAt = new Map<string, number>();
const latencies: number[] = [];
let deliveries = 0;

log(`Opening ${socketCount} socket(s), ${observers} of them timing deliveries…`);
const fleet = await openFleet({
  baseUrl,
  origin,
  size: socketCount,
  roomIds,
  observers,
  onDelivery(messageId, isObserver) {
    deliveries += 1;
    const sentAt = postedAt.get(messageId);
    if (isObserver && sentAt !== undefined) latencies.push(performance.now() - sentAt);
  },
});

const memoryBefore = await memoryOfContainer();
log(
  `${fleet.opened} socket(s) open, ${fleet.refused} refused. Posting ${messagesPerSecond}/s for ${seconds}s…`,
);

const startedAt = performance.now();
const writes = await writeMessages({
  baseUrl,
  origin,
  roomIds,
  messagesPerSecond,
  seconds,
  clientHeader,
  onPosted: (messageId, at) => postedAt.set(messageId, at),
});

// The last frames are still in flight when the last POST answers; without this grace the
// run would report its own impatience as lost messages.
await new Promise((resume) => setTimeout(resume, 3_000));
const elapsedSeconds = (performance.now() - startedAt) / 1000;
const memoryAfter = await memoryOfContainer();

fleet.close();

const subscribersPerRoom = Math.floor(socketCount / roomCount);
const expectedDeliveries = writes.accepted * subscribersPerRoom;
const result = {
  label: values.label,
  at: new Date().toISOString(),
  plan: { sockets: socketCount, rooms: roomCount, messagesPerSecond, seconds, observers, clientHeader },
  sockets: {
    opened: fleet.opened,
    refused: fleet.refused,
    closedEarly: fleet.closedEarly(),
    errors: fleet.socketErrors(),
  },
  writes: { ...writes, achievedPerSecond: Number((writes.attempted / elapsedSeconds).toFixed(2)) },
  deliveries: { observed: deliveries, expected: expectedDeliveries, subscribersPerRoom },
  latencyMilliseconds: summarise(latencies),
  memory: { before: memoryBefore, after: memoryAfter },
  errorRate: Number((1 - writes.accepted / Math.max(writes.attempted, 1)).toFixed(4)),
};

if (values.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
  const summary = result.latencyMilliseconds;
  console.log(
    `\n${result.label}: ${writes.accepted}/${writes.attempted} accepted, p95 ${Math.round(summary.p95)} ms, ` +
      `${deliveries}/${expectedDeliveries} deliveries, memory ${memoryBefore ?? "n/a"} → ${memoryAfter ?? "n/a"}`,
  );
}

process.exit(0);
