import { describe, expect, it } from "vitest";
import { type CheckedDraft, checkDraft } from "../../src/messages/message-draft.ts";

const problems = (checked: CheckedDraft) => ("problems" in checked ? checked.problems : undefined);

describe("checkDraft", () => {
  it("passes a draft on with the whitespace gone, which is what will be posted", () => {
    expect(checkDraft({ username: "  ana  ", body: "  hello  " })).toEqual({
      posted: { username: "ana", body: "hello" },
    });
  });

  it("asks for a user name rather than sending an empty one", () => {
    expect(problems(checkDraft({ username: "", body: "hello" }))?.username).toBe(
      "Write a user name before sending.",
    );
  });

  it("treats a user name of only spaces as no user name at all", () => {
    expect(problems(checkDraft({ username: "   ", body: "hello" }))?.username).toBe(
      "Write a user name before sending.",
    );
  });

  it("says how long a user name may be when it is too long", () => {
    expect(problems(checkDraft({ username: "n".repeat(33), body: "hello" }))?.username).toBe(
      "A user name is at most 32 characters.",
    );
  });

  it("accepts a user name of exactly the length the API accepts", () => {
    expect(checkDraft({ username: "n".repeat(32), body: "hello" })).toHaveProperty("posted");
  });

  it("asks for a message rather than sending an empty one", () => {
    expect(problems(checkDraft({ username: "ana", body: "   " }))?.body).toBe(
      "Write a message before sending.",
    );
  });

  it("says how long a message may be when it is too long", () => {
    expect(problems(checkDraft({ username: "ana", body: "b".repeat(501) }))?.body).toBe(
      "A message is at most 500 characters.",
    );
  });

  it("accepts a message of exactly the length the API accepts", () => {
    expect(checkDraft({ username: "ana", body: "b".repeat(500) })).toHaveProperty("posted");
  });

  it("reports both fields at once, so one fix does not uncover the next", () => {
    expect(problems(checkDraft({ username: "", body: "" }))).toEqual({
      username: "Write a user name before sending.",
      body: "Write a message before sending.",
    });
  });

  it("leaves the field that is fine unremarked", () => {
    expect(problems(checkDraft({ username: "ana", body: "" }))?.username).toBeUndefined();
  });
});
