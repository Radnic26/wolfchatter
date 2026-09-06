import type { NetworkInterfaceInfo } from "node:os";

/**
 * The origins this process answers to besides `localhost`: its own addresses on the network,
 * at the port it serves. A phone on the same Wi-Fi reaches the app by one of these, and the
 * write gate and the socket upgrade both check `Origin`, so without them the map loads and
 * nothing else works.
 *
 * Allowing them is not a hole: a page served from anywhere else still sends its own origin
 * and is still refused. These are the names this very host answers to.
 *
 * Inside a container these are the container's addresses on the bridge network, which no
 * phone can reach — the host's address is not visible from in here at all. That is why the
 * wizard, which runs on the host, writes it into `ALLOWED_ORIGINS` as well.
 */
export function networkOrigins(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>, port: number): string[] {
  const origins = new Set<string>();
  for (const addresses of Object.values(interfaces)) {
    for (const candidate of addresses ?? []) {
      if (candidate.family === "IPv4" && !candidate.internal) {
        origins.add(`http://${candidate.address}:${port}`);
      }
    }
  }
  return [...origins].sort();
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The origins worth printing when the process starts: the ones that reach this port from
 * somewhere other than this machine. In a container the addresses cannot be discovered, but
 * they arrive anyway — the wizard put them in ALLOWED_ORIGINS and compose passed it through
 * — so the list the app is willing to answer is also the list of ways to reach it.
 */
export function reachableOrigins(allowed: readonly string[], port: number): string[] {
  const reachable = new Set<string>();
  for (const origin of allowed) {
    const parsed = URL.parse(origin);
    if (parsed === null || loopbackHosts.has(parsed.hostname)) continue;
    if (parsed.port === String(port)) reachable.add(parsed.origin);
  }
  return [...reachable].sort();
}
