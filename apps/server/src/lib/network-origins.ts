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
