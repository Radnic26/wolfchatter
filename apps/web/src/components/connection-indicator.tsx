import type { ConnectionStatus } from "@wolfchatter/shared/client";

const wording: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

/**
 * Whether what the map shows is still arriving on its own. It sits in the header because it
 * is the app's state rather than a room's, and because the header is the one bar the sheet
 * never lies over — so the answer is there at a glance with the sheet collapsed on a phone.
 * The mark is dimmed rather than swapped when the connection is down: the words carry the
 * state, which is what lets the mark be decorative.
 */
export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const live = status === "live";

  return (
    <p role="status" className="ml-auto flex shrink-0 items-center gap-1.5 text-ink/70 text-sm">
      <picture className={live ? undefined : "animate-pulse opacity-50 motion-reduce:animate-none"}>
        <source srcSet="/brand/state-live-dark.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/state-live-light.svg" alt="" className="size-5" />
      </picture>
      {wording[status]}
    </p>
  );
}
