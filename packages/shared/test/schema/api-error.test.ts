import { describe, expect, it } from "vitest";
import { apiErrorSchema, errorCodeSchema } from "../../src/schema/index.ts";

describe("apiErrorSchema", () => {
  it("accepts a code and the request id it can be traced by", () => {
    const failure = { error: { code: "room_not_found", requestId: "0199c0de-2222-7abc-8def-0123456789ab" } };

    expect(apiErrorSchema.parse(failure)).toEqual(failure);
  });

  it("rejects a code outside the vocabulary", () => {
    expect(errorCodeSchema.safeParse("teapot").success).toBe(false);
  });

  it("rejects a body that leaks an exception message", () => {
    const leaky = {
      error: { code: "internal_error", requestId: "0199c0de-3333-7abc-8def-0123456789ab" },
      stack: "at db.ts",
    };

    expect(apiErrorSchema.parse(leaky)).not.toHaveProperty("stack");
  });
});
