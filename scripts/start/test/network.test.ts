import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { localNetworkAddresses, networkUrls } from "../network.ts";

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

describe("localNetworkAddresses", () => {
  it("finds the address someone would type into a phone", () => {
    expect(localNetworkAddresses({ en0: [ipv4("192.168.1.20")] })).toEqual(["192.168.1.20"]);
  });

  it("leaves out the loopback, which reaches nothing but this machine", () => {
    expect(localNetworkAddresses({ lo0: [ipv4("127.0.0.1", true)] })).toEqual([]);
  });

  it("leaves out IPv6, because the URL a phone is given has to be typed", () => {
    expect(localNetworkAddresses({ en0: [ipv6] })).toEqual([]);
  });

  it("reports every interface, since which one carries the Wi-Fi is not ours to guess", () => {
    const addresses = localNetworkAddresses({
      en0: [ipv4("192.168.1.20")],
      en1: [ipv4("10.0.0.5")],
    });

    expect(addresses).toEqual(["10.0.0.5", "192.168.1.20"]);
  });

  it("names an address once, however many interfaces carry it", () => {
    const addresses = localNetworkAddresses({
      en0: [ipv4("192.168.1.20")],
      bridge0: [ipv4("192.168.1.20")],
    });

    expect(addresses).toEqual(["192.168.1.20"]);
  });

  it("survives an interface the platform reported as absent", () => {
    expect(localNetworkAddresses({ en0: undefined })).toEqual([]);
  });

  it("finds nothing on a machine with no network at all", () => {
    expect(localNetworkAddresses({})).toEqual([]);
  });
});

describe("networkUrls", () => {
  it("puts the port on each address, which is what gets printed and typed", () => {
    expect(networkUrls(["192.168.1.20", "10.0.0.5"], 3000)).toEqual([
      "http://192.168.1.20:3000",
      "http://10.0.0.5:3000",
    ]);
  });

  it("has nothing to offer when there is no address", () => {
    expect(networkUrls([], 3000)).toEqual([]);
  });
});
