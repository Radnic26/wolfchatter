import type { Message } from "@wolfchatter/shared/schema";
import { type UIEvent, useEffect, useRef, useState } from "react";
import { formatTimestamp } from "./format-timestamp.ts";
import { isShowingNewest } from "./scrolled-to-newest.ts";

type MessageListProps = {
  messages: readonly Message[];
};

function RoomEmptyState() {
  return (
    <div className="m-auto flex flex-col items-center gap-3 py-6 text-center">
      <picture>
        <source srcSet="/brand/state-room-dark.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/state-room-light.svg" alt="" className="size-16" />
      </picture>
      <p className="text-ink/70 text-sm">No messages here yet. Write the first one.</p>
    </div>
  );
}

/**
 * The order is the server's and is never recomputed here: it sorts on a sequence no message
 * carries, so the only field this side could sort on is the timestamp, and a burst of
 * messages sharing a second would come out shuffled.
 *
 * Following the newest message is a property of where the reader is, read from the element
 * when they scroll rather than mirrored into state that could disagree with it. A short
 * history hangs from the bottom, so the newest line is always the one against the composer.
 */
export function MessageList({ messages }: MessageListProps) {
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // Nothing renders this, so it is a ref: a scroll would otherwise re-render the whole list.
  const followsNewest = useRef(true);
  const newest = messages.at(-1)?.id;

  useEffect(() => {
    if (list === null || newest === undefined || !followsNewest.current) return;

    list.scrollTop = list.scrollHeight;
  }, [list, newest]);

  function rememberWhatTheReaderIsLookingAt(event: UIEvent<HTMLDivElement>) {
    followsNewest.current = isShowingNewest(event.currentTarget);
  }

  return (
    <div
      ref={setList}
      onScroll={rememberWhatTheReaderIsLookingAt}
      role="log"
      aria-label="Chatroom messages"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4"
    >
      {messages.length === 0 ? (
        <RoomEmptyState />
      ) : (
        <ol className="mt-auto flex flex-col gap-3 py-2">
          {messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-0.5">
              <p className="flex items-baseline gap-2">
                <span className="min-w-0 truncate font-display text-sm">{message.username}</span>
                <time dateTime={message.createdAt} className="shrink-0 text-ink/60 text-xs">
                  {formatTimestamp(message.createdAt)}
                </time>
              </p>
              <p className="wrap-anywhere text-sm">{message.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
