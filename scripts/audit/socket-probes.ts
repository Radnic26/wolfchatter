import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { held, missed, type Probe, type ProbeResult, type Target } from "./probe.ts";

const openTimeoutMilliseconds = 5_000;

function socketUrl(target: Target): string {
  return `${target.baseUrl.replace(/^http/, "ws")}/ws`;
}

interface Handshake {
  opened: boolean;
  detail: string;
}

/**
 * Node's global `WebSocket` cannot set `Origin`, and this server refuses an upgrade that
 * carries none, so every socket here comes from `ws` — the client the server already
 * depends on, which is why the audit adds no package to do this.
 */
function connect(
  target: Target,
  origin: string | undefined,
): Promise<{ socket: WebSocket; result: Handshake }> {
  const socket = new WebSocket(socketUrl(target), origin === undefined ? {} : { origin });

  return new Promise((resolve) => {
    const settle = (result: Handshake) => {
      clearTimeout(timer);
      resolve({ socket, result });
    };
    const timer = setTimeout(
      () => settle({ opened: false, detail: "no answer within 5 s" }),
      openTimeoutMilliseconds,
    );

    socket.once("open", () => settle({ opened: true, detail: "101 Switching Protocols" }));
    socket.once("unexpected-response", (_request, response) => {
      socket.terminate();
      settle({ opened: false, detail: `${response.statusCode} ${response.statusMessage}` });
    });
    socket.once("error", (error) => settle({ opened: false, detail: error.message }));
  });
}

async function handshakeProbe(
  target: Target,
  origin: string | undefined,
  expectOpen: boolean,
): Promise<ProbeResult> {
  const { socket, result } = await connect(target, origin);
  socket.close();
  const observed = `origin ${origin ?? "(absent)"} → ${result.detail}`;
  return result.opened === expectOpen ? held(observed) : missed(observed);
}

function waitForFrame(
  socket: WebSocket,
  matches: (frame: string) => boolean,
  milliseconds: number,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off("message", listen);
      resolve(undefined);
    }, milliseconds);

    const listen = (data: unknown) => {
      const frame = String(data);
      if (!matches(frame)) return;
      clearTimeout(timer);
      socket.off("message", listen);
      resolve(frame);
    };

    socket.on("message", listen);
  });
}

export function socketProbes(roomId: string): Probe[] {
  return [
    {
      name: "allowed-origin-ws",
      control: "Origin allowlist on the upgrade",
      expectation:
        "the app's own origin is upgraded, so the refusals below mean the allowlist and not an outage",
      run: (target) => handshakeProbe(target, target.origin, true),
    },
    {
      name: "forbidden-origin-ws",
      control: "Origin allowlist on the upgrade",
      expectation: "an origin that is not on the list is refused before the upgrade",
      run: (target) => handshakeProbe(target, "https://evil.example", false),
    },
    {
      name: "missing-origin-ws",
      control: "Origin allowlist on the upgrade",
      expectation: "an upgrade carrying no Origin is refused, because a browser always sends one",
      run: (target) => handshakeProbe(target, undefined, false),
    },
    {
      name: "binary-frame",
      control: "every WS frame Zod-validated",
      expectation: "a binary frame is answered with an error, never parsed",
      run: async (target) => {
        const { socket, result } = await connect(target, target.origin);
        if (!result.opened) return missed(`could not open a socket: ${result.detail}`);

        socket.send(Buffer.from([0x00, 0x01, 0x02]));
        const answer = await waitForFrame(socket, (frame) => frame.includes('"error"'), 2_000);
        socket.close();
        const observed = answer ?? "(no frame within 2 s)";
        return answer?.includes("invalid_frame") === true ? held(observed) : missed(observed);
      },
    },
    {
      name: "malformed-frame",
      control: "every WS frame Zod-validated",
      expectation: "text that is not a known frame is answered with an error and does not close the process",
      run: async (target) => {
        const { socket, result } = await connect(target, target.origin);
        if (!result.opened) return missed(`could not open a socket: ${result.detail}`);

        socket.send('{"type":"subscribe","roomId":"not-a-uuid"}');
        const answer = await waitForFrame(socket, (frame) => frame.includes('"error"'), 2_000);
        socket.close();
        const observed = answer ?? "(no frame within 2 s)";
        return answer !== undefined ? held(observed) : missed(observed);
      },
    },
    {
      name: "frame-flood",
      control: "per-connection rate limit",
      expectation: "a burst past the frame allowance is refused rather than served",
      run: async (target) => {
        const { socket, result } = await connect(target, target.origin);
        if (!result.opened) return missed(`could not open a socket: ${result.detail}`);

        const refused = waitForFrame(socket, (frame) => frame.includes("rate_limited"), 3_000);
        for (let sent = 0; sent < 200; sent += 1) {
          socket.send(JSON.stringify({ type: "subscribe", roomId }));
        }
        const answer = await refused;
        socket.close();
        const observed =
          answer === undefined ? "200 frames accepted with no refusal" : `refused after a burst: ${answer}`;
        return answer !== undefined ? held(observed) : missed(observed);
      },
    },
    {
      name: "connection-flood",
      control: "DoS surface: connection flood",
      expectation:
        "many sockets opened at once are served or refused, and the process still answers afterwards",
      run: async (target) => {
        const attempts = 300;
        const sockets = await Promise.all(
          Array.from({ length: attempts }, () => connect(target, target.origin)),
        );
        const opened = sockets.filter(({ result }) => result.opened).length;
        for (const { socket } of sockets) socket.terminate();

        const health = await fetch(`${target.baseUrl}/api/health`);
        const observed = `${opened}/${attempts} sockets opened; /api/health then answered ${health.status}`;
        return health.status === 200 ? held(observed) : missed(observed);
      },
    },
    {
      name: "slow-consumer",
      control: "DoS surface: a reader that never drains",
      // The hub's bound counts what this process still holds, and the kernel's own send
      // buffer fills first, so what a probe from outside can show is the property the
      // service actually keeps: one reader that has stopped draining does not take it down.
      expectation:
        "the process keeps serving everyone else, and the volume one stalled reader holds is recorded",
      run: async (target) => {
        if (target.clientHeader === undefined) {
          return missed(
            "needs TRUSTED_CLIENT_HEADER on the stack under test: filling the queue costs more writes than one caller's allowance",
          );
        }

        const { socket: slow, result } = await connect(target, target.origin);
        if (!result.opened) return missed(`could not open a socket: ${result.detail}`);
        slow.send(JSON.stringify({ type: "subscribe", roomId }));

        // Nothing is read from this socket: `ws` buffers what arrives, the kernel window
        // closes behind it and the server's own queue is what grows.
        const closed = new Promise<string>((resolve) => {
          slow.once("close", (code) => resolve(`closed with ${code}`));
          slow.once("error", (error) => resolve(`errored: ${error.message}`));
        });
        slow.pause();

        // A room busy enough to bury a reader is a room with concurrent writers, so the
        // flood is concurrent too: posting one at a time drains as fast as it fills.
        const paragraph = "y".repeat(480);
        const clientHeader = target.clientHeader;
        const batches = 40;
        const perBatch = 500;
        let posted = 0;
        const flooding = (async () => {
          for (let batch = 0; batch < batches; batch += 1) {
            await Promise.all(
              Array.from({ length: perBatch }, (_unused, index) =>
                fetch(`${target.baseUrl}/api/rooms/${roomId}/messages`, {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    origin: target.origin,
                    [clientHeader]: `10.9.${(batch + index) % 250}.${index % 250}`,
                  },
                  body: JSON.stringify({ id: randomUUID(), username: "flood", body: paragraph }),
                }).then((response) => response.body?.cancel()),
              ),
            );
            posted += perBatch;
          }
        })();

        const verdict = await Promise.race([
          closed,
          flooding.then(() => `still open after ${batches * perBatch} messages`),
        ]);
        slow.terminate();

        const health = await fetch(`${target.baseUrl}/api/health`);
        const heldBytes = ((posted * 678) / (1024 * 1024)).toFixed(1);
        const observed = `${verdict}; up to ${heldBytes} MiB queued for one stalled reader; /api/health then answered ${health.status}`;
        return health.status === 200 ? held(observed) : missed(observed);
      },
    },
  ];
}
