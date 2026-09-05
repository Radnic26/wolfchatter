import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../../src/messages/format-timestamp.ts";

describe("formatTimestamp", () => {
  it("writes the day, the month and the year in the order the mockup shows", () => {
    expect(formatTimestamp("2017-02-01T13:45:00.000Z", "UTC")).toBe("01/02/2017 13:45");
  });

  it("pads a single digit, so every stamp in the list is the same width", () => {
    expect(formatTimestamp("2026-09-05T09:05:00.000Z", "UTC")).toBe("05/09/2026 09:05");
  });

  it("writes midnight as 00:00 rather than as the 24:00 of the day before", () => {
    expect(formatTimestamp("2026-09-05T00:00:00.000Z", "UTC")).toBe("05/09/2026 00:00");
  });

  it("keeps the clock at 24 hours, so the afternoon is not an ambiguous 1", () => {
    expect(formatTimestamp("2026-09-05T23:59:00.000Z", "UTC")).toBe("05/09/2026 23:59");
  });

  it("moves the stamp into the zone it is read in, which can be the day before", () => {
    expect(formatTimestamp("2026-09-05T01:00:00.000Z", "America/New_York")).toBe("04/09/2026 21:00");
  });

  it("reads in the zone of the browser when it is given none, which is what FR-5 asks for", () => {
    const here = new Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(formatTimestamp("2026-09-05T01:00:00.000Z")).toBe(
      formatTimestamp("2026-09-05T01:00:00.000Z", here),
    );
  });
});
