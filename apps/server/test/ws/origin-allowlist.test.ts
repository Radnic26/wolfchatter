import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../../src/ws/origin-allowlist.ts";

const allowed = ["http://localhost:5173", "capacitor://localhost"];

describe("isAllowedOrigin", () => {
  it("lets through an origin the deployment serves", () => {
    expect(isAllowedOrigin("http://localhost:5173", allowed)).toBe(true);
  });

  it("lets through the shell a native app would upgrade from", () => {
    expect(isAllowedOrigin("capacitor://localhost", allowed)).toBe(true);
  });

  it("refuses a page on another site, which is the attack the check exists for", () => {
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
  });

  it("refuses an origin that only looks like one on the list", () => {
    expect(isAllowedOrigin("http://localhost:5173.evil.example", allowed)).toBe(false);
  });

  it("refuses a handshake carrying no origin at all, rather than trusting it", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
});
