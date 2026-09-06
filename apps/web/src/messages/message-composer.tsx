import { useActionState, useState } from "react";
import { checkDraft, type DraftProblems, type MessageDraft } from "./message-draft.ts";

type MessageComposerProps = {
  username: string;
  disabled: boolean;
  onSend: (draft: MessageDraft) => Promise<void>;
};

type ComposerProblems = DraftProblems & { send?: string };

/* The accent marks the field that was refused. A border is a non-text element, so the hot
   accent clears its 3:1 there; the words below the field take the darker one. The placeholder
   is the label a person actually reads here, so it is held to text contrast like any other. */
const fieldClasses =
  "min-h-11 w-full rounded-lg border border-rule bg-ground px-3 text-base outline-offset-2 placeholder:text-ink/60 aria-[invalid=true]:border-accent";

function Problem({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-accent-strong text-sm">
      {children}
    </p>
  );
}

/**
 * The fields are controlled, so a send that fails leaves the words the sender typed in place
 * to be sent again: React resets an uncontrolled form as soon as its action settles, whether
 * or not the action succeeded.
 */
export function MessageComposer({ username, disabled, onSend }: MessageComposerProps) {
  const [name, setName] = useState(username);
  const [body, setBody] = useState("");

  const [problems, submit, sending] = useActionState<ComposerProblems>(async () => {
    const checked = checkDraft({ username: name, body });
    if ("problems" in checked) return checked.problems;

    try {
      await onSend(checked.posted);
      // Whatever was typed while the request was in flight is the next message rather than
      // the one that just went out, so only the words that were sent are cleared.
      setBody((typed) => (typed === body ? "" : typed));
      return {};
    } catch (failure) {
      console.error("The message could not be sent", failure);
      return { send: "That message was not sent. Try again." };
    }
  }, {});

  return (
    <form
      action={submit}
      className="flex shrink-0 flex-col gap-2 border-rule border-t px-4 pt-3 pb-4 md:pb-3"
    >
      <label className="sr-only" htmlFor="composer-username">
        Your user name
      </label>
      <input
        id="composer-username"
        className={fieldClasses}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="write your user name here"
        disabled={disabled}
        aria-invalid={problems.username !== undefined}
        aria-describedby={problems.username === undefined ? undefined : "composer-username-problem"}
      />
      {problems.username === undefined ? null : (
        <Problem id="composer-username-problem">{problems.username}</Problem>
      )}

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="composer-body">
          Your message
        </label>
        <input
          id="composer-body"
          className={fieldClasses}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="write message here"
          disabled={disabled}
          aria-invalid={problems.body !== undefined}
          aria-describedby={problems.body === undefined ? undefined : "composer-body-problem"}
        />
        <button
          type="submit"
          disabled={disabled || sending}
          className="min-h-11 shrink-0 rounded-lg bg-accent-strong px-4 font-display text-base text-ground disabled:opacity-50"
        >
          Submit
        </button>
      </div>
      {problems.body === undefined ? null : <Problem id="composer-body-problem">{problems.body}</Problem>}
      {problems.send === undefined ? null : <Problem id="composer-send-problem">{problems.send}</Problem>}
    </form>
  );
}
