import { messageBodySchema, usernameSchema } from "@wolfchatter/shared/schema";

export type MessageDraft = {
  username: string;
  body: string;
};

export type DraftProblems = {
  username?: string;
  body?: string;
};

export type CheckedDraft = { posted: MessageDraft } | { problems: DraftProblems };

function problemWith(value: string, field: string, limit: number): string {
  return value.trim() === ""
    ? `Write a ${field} before sending.`
    : `A ${field} is at most ${limit} characters.`;
}

/**
 * The shared schemas decide what is valid and the words here are what a person reads, so the
 * rule is never restated. They trim as they parse, which is why what comes back is exactly
 * what will be posted rather than what was typed.
 */
export function checkDraft(draft: MessageDraft): CheckedDraft {
  const username = usernameSchema.safeParse(draft.username);
  const body = messageBodySchema.safeParse(draft.body);

  if (username.success && body.success) {
    return { posted: { username: username.data, body: body.data } };
  }

  return {
    problems: {
      username: username.success ? undefined : problemWith(draft.username, "user name", 32),
      body: body.success ? undefined : problemWith(draft.body, "message", 500),
    },
  };
}
