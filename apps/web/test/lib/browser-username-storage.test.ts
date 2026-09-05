import { afterEach, describe, expect, it, vi } from "vitest";
import { browserUsernameStorage } from "../../src/lib/browser-username-storage.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("browserUsernameStorage", () => {
  it("has no name to offer on a first visit", () => {
    expect(browserUsernameStorage().read()).toBe("");
  });

  it("offers back the name it was given, which is what the next visit opens with", () => {
    const storage = browserUsernameStorage();

    storage.write("ana");

    expect(browserUsernameStorage().read()).toBe("ana");
  });

  it("forgets rather than fails when the browser refuses to be read", () => {
    const complain = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage is disabled");
      },
    });

    expect(browserUsernameStorage().read()).toBe("");
    expect(complain).toHaveBeenCalled();
  });

  it("forgets rather than fails when the browser refuses to be written to", () => {
    const complain = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("the quota is spent");
      },
    });

    expect(() => browserUsernameStorage().write("ana")).not.toThrow();
    expect(complain).toHaveBeenCalled();
  });
});
