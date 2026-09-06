import { randomUUID } from "node:crypto";
import { callerHeaders, held, missed, type Probe, type ProbeResult, readBody, type Target } from "./probe.ts";

const jsonHeaders = { "content-type": "application/json" };

/**
 * A refusal a client can act on and nothing more. Anything past the code and the request id
 * — a driver message, a SQL fragment, a stack frame — is the server describing itself to
 * whoever asked, which is the opposite of the generic body NFR-2 asks for.
 */
const disclosures = ["stack", "at Object.", "postgres", "syntax error", "relation", "node_modules"];

function discloses(body: string): boolean {
  const lowercase = body.toLowerCase();
  return disclosures.some((disclosure) => lowercase.includes(disclosure.toLowerCase()));
}

function isGenericRefusal(body: string): boolean {
  if (discloses(body)) return false;
  try {
    const parsed: unknown = JSON.parse(body);
    const error = (parsed as { error?: { code?: unknown; requestId?: unknown } }).error;
    return typeof error?.code === "string" && typeof error?.requestId === "string";
  } catch {
    return false;
  }
}

async function post(target: Target, path: string, body: string, caller: string, origin = target.origin) {
  return fetch(`${target.baseUrl}${path}`, {
    method: "POST",
    headers: { ...jsonHeaders, origin, ...callerHeaders(target, caller) },
    body,
  });
}

/** A room to post into, so the message probes exercise a path that exists. */
export async function openProbeRoom(target: Target): Promise<string> {
  const id = randomUUID();
  const body = JSON.stringify({ id, lat: 12.5, lng: 34.5 });
  const response = await post(target, "/api/rooms", body, "10.0.0.1");
  if (!response.ok) {
    throw new Error(`could not open a room to probe with: ${response.status} ${await readBody(response)}`);
  }
  return id;
}

async function refusalProbe(
  target: Target,
  path: string,
  body: string,
  caller: string,
  expected: number,
): Promise<ProbeResult> {
  const response = await post(target, path, body, caller);
  const text = await readBody(response);
  const observed = `${response.status} ${text}`;
  return response.status === expected && isGenericRefusal(text) ? held(observed) : missed(observed);
}

export function httpProbes(roomId: string): Probe[] {
  const message = (fields: Record<string, unknown>) => JSON.stringify({ id: randomUUID(), ...fields });
  const messagesOf = (room: string) => `/api/rooms/${room}/messages`;

  return [
    {
      name: "invalid-json",
      control: "every input Zod-validated",
      expectation: "400 with a generic body, never a parser message",
      run: (target) => refusalProbe(target, "/api/rooms", '{"id": "', "10.0.0.2", 400),
    },
    {
      name: "oversized-body",
      control: "16 KiB payload cap",
      expectation: "413 before the body is validated",
      run: (target) => {
        const oversized = message({ username: "probe", body: "x".repeat(17 * 1024) });
        return refusalProbe(target, messagesOf(roomId), oversized, "10.0.0.3", 413);
      },
    },
    {
      name: "absurd-coordinates",
      control: "every input Zod-validated",
      expectation: "400 for every point off the globe, and for a coordinate that is not a number",
      run: async (target) => {
        const points = [
          { lat: 91, lng: 0 },
          { lat: 0, lng: 181 },
          { lat: -1e308, lng: 0 },
          { lat: "0", lng: 0 },
          { lat: null, lng: 0 },
        ];
        const answers = [];
        for (const [index, point] of points.entries()) {
          const body = JSON.stringify({ id: randomUUID(), ...point });
          const response = await post(target, "/api/rooms", body, `10.0.1.${index}`);
          const shape = isGenericRefusal(await readBody(response)) ? "generic" : "DISCLOSING";
          answers.push(`${JSON.stringify(point)} → ${response.status} ${shape}`);
        }
        const observed = answers.join("; ");
        return answers.every((answer) => answer.endsWith("400 generic")) ? held(observed) : missed(observed);
      },
    },
    {
      name: "unknown-room",
      control: "every input Zod-validated",
      expectation: "404 on reading and on posting to a room that does not exist",
      run: async (target) => {
        const absent = randomUUID();
        const read = await fetch(`${target.baseUrl}${messagesOf(absent)}`);
        const body = message({ username: "probe", body: "hello" });
        const write = await post(target, messagesOf(absent), body, "10.0.0.4");
        const observed = `GET ${read.status}, POST ${write.status}`;
        return read.status === 404 && write.status === 404 ? held(observed) : missed(observed);
      },
    },
    {
      name: "malformed-room-id",
      control: "every input Zod-validated",
      expectation: "400 for a path parameter that is not a uuid, a traversal attempt included",
      run: async (target) => {
        const identifiers = ["not-a-uuid", "../../etc/passwd", "1 OR 1=1", "%00"];
        const answers = [];
        for (const identifier of identifiers) {
          const response = await fetch(`${target.baseUrl}${messagesOf(encodeURIComponent(identifier))}`);
          answers.push(`${identifier} → ${response.status}`);
        }
        const observed = answers.join("; ");
        return answers.every((answer) => answer.endsWith("→ 400")) ? held(observed) : missed(observed);
      },
    },
    {
      name: "sql-injection",
      control: "parameterised SQL only",
      expectation: "the payload is stored as text and the tables are still there",
      run: async (target) => {
        const payload = "'; DROP TABLE messages; --";
        const body = message({ username: "probe", body: payload });
        const write = await post(target, messagesOf(roomId), body, "10.0.0.5");
        const stored = (await write.json()) as { body?: string };
        const survivors = await fetch(`${target.baseUrl}${messagesOf(roomId)}`);
        const rows = (await survivors.json()) as unknown[];
        const observed = `stored ${JSON.stringify(stored.body)}, list answered ${survivors.status} with ${rows.length} row(s)`;
        return stored.body === payload && survivors.status === 200 ? held(observed) : missed(observed);
      },
    },
    {
      name: "html-injection",
      control: "generic error bodies · CSP",
      expectation: "the payload comes back as JSON text, never as a document a browser would run",
      run: async (target) => {
        const payload = "<script>alert(document.domain)</script><img src=x onerror=alert(1)>";
        const body = message({ username: "probe", body: payload });
        const write = await post(target, messagesOf(roomId), body, "10.0.0.6");
        const contentType = write.headers.get("content-type") ?? "(none)";
        const nosniff = write.headers.get("x-content-type-options") ?? "(none)";
        const stored = (await write.json()) as { body?: string };
        const observed = `content-type ${contentType}, x-content-type-options ${nosniff}, stored verbatim ${stored.body === payload}`;
        const isJson = contentType.includes("application/json");
        return isJson && nosniff === "nosniff" && stored.body === payload ? held(observed) : missed(observed);
      },
    },
    {
      name: "null-character",
      control: "every input Zod-validated",
      expectation: "400, because the driver answers a NUL inside a text value with a 500",
      run: (target) => {
        const body = message({ username: "probe", body: `before${String.fromCharCode(0)}after` });
        return refusalProbe(target, messagesOf(roomId), body, "10.0.0.7", 400);
      },
    },
    {
      name: "unknown-field",
      control: "every input Zod-validated",
      expectation: "400: the write schemas are strict, so an extra field is refused rather than ignored",
      run: (target) => {
        const body = JSON.stringify({ id: randomUUID(), lat: 1, lng: 2, isAdmin: true });
        return refusalProbe(target, "/api/rooms", body, "10.0.0.8", 400);
      },
    },
    {
      name: "oversized-query-limit",
      control: "every input Zod-validated",
      expectation: "400 rather than a page the caller sized",
      run: async (target) => {
        const response = await fetch(`${target.baseUrl}${messagesOf(roomId)}?limit=100000`);
        const observed = `${response.status} ${await readBody(response)}`;
        return response.status === 400 ? held(observed) : missed(observed);
      },
    },
    {
      name: "forbidden-origin-http",
      control: "Origin allowlist on HTTP",
      expectation: "403 for a write from an origin that is not on the list",
      run: async (target) => {
        const body = JSON.stringify({ id: randomUUID(), lat: 1, lng: 2 });
        const response = await post(target, "/api/rooms", body, "10.0.0.9", "https://evil.example");
        const observed = `${response.status} ${await readBody(response)}`;
        return response.status === 403 ? held(observed) : missed(observed);
      },
    },
    {
      name: "unmatched-api-path",
      control: "generic error bodies",
      expectation: "404 as JSON, never the single-page shell with a 200",
      run: async (target) => {
        const response = await fetch(`${target.baseUrl}/api/does-not-exist`);
        const text = await readBody(response);
        const observed = `${response.status} ${response.headers.get("content-type")} ${text}`;
        return response.status === 404 && isGenericRefusal(text) ? held(observed) : missed(observed);
      },
    },
  ];
}
