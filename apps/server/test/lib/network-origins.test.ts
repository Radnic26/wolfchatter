import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { networkOrigins } from "../../src/lib/network-origins.ts";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

const ipv6: NetworkInterfaceInfo = {
  address: "fe80::1",
  netmask: "ffff:ffff:ffff:ffff::",
  family: "IPv6",
  mac: "00:00:00:00:00:00",
  internal: false,
  cidr: "fe80::1/64",
  scopeid: 1,
};

describe("networkOrigins", () => {
  it("allows the origin a phone on the same network would send", () => {
    expect(networkOrigins({ en0: [ipv4("192.168.1.20")] }, 3000)).toEqual(["http://192.168.1.20:3000"]);
  });

  it("leaves out the loopback, which localhost already covers", () => {
    expect(networkOrigins({ lo0: [ipv4("127.0.0.1", true)] }, 3000)).toEqual([]);
  });

  it("leaves out IPv6, which no browser bar in this project ever carries", () => {
    expect(networkOrigins({ en0: [ipv6] }, 3000)).toEqual([]);
  });

  it("carries the port it serves on, not a default", () => {
    expect(networkOrigins({ en0: [ipv4("10.0.0.5")] }, 8080)).toEqual(["http://10.0.0.5:8080"]);
  });

  it("names an origin once, however many interfaces carry the address", () => {
    const origins = networkOrigins({ en0: [ipv4("192.168.1.20")], bridge0: [ipv4("192.168.1.20")] }, 3000);

    expect(origins).toEqual(["http://192.168.1.20:3000"]);
  });

  it("survives an interface the platform reported as absent", () => {
    expect(networkOrigins({ en0: undefined }, 3000)).toEqual([]);
  });

  it("allows nothing extra on a machine with no network", () => {
    expect(networkOrigins({}, 3000)).toEqual([]);
  });
});
