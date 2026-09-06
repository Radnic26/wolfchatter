import type { NetworkInterfaceInfo } from "node:os";

/**
 * The addresses this machine answers to on the network, which is what someone types into a
 * phone. The wizard is the only part of the system that can know them: in Docker mode the
 * server runs in a container and sees the bridge network instead, so the origin a phone
 * sends would be refused unless it is written into `.env` from out here.
 */
export function localNetworkAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const addresses = new Set<string>();
  for (const candidates of Object.values(interfaces)) {
    for (const candidate of candidates ?? []) {
      if (candidate.family === "IPv4" && !candidate.internal) addresses.add(candidate.address);
    }
  }
  return [...addresses].sort();
}

/** Where the app answers for someone on the same Wi-Fi, in the order the wizard prints them. */
export function networkUrls(addresses: readonly string[], port: number): string[] {
  return addresses.map((address) => `http://${address}:${port}`);
}
