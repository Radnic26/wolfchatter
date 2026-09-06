import type { ConnectionStatus } from "@wolfchatter/shared/client";
import { ConnectionIndicator } from "./connection-indicator.tsx";

/**
 * The wordmark carries its own theme: `<picture>` picks the file, so there is no second
 * copy of the image hidden behind a class and no flash of the wrong one.
 */
export function AppHeader({ connection }: { connection: ConnectionStatus }) {
  return (
    <header className="shrink-0 border-rule border-b bg-ground pt-[env(safe-area-inset-top)]">
      {/* A phone on its side puts the notch beside the wordmark, so the padding is whichever
          is larger: the layout's own or the inset the screen asks for. */}
      <div
        className="flex h-12 items-center gap-3 pl-[max(1rem,env(safe-area-inset-left))]
          pr-[max(1rem,env(safe-area-inset-right))] md:h-14 md:pl-[max(1.5rem,env(safe-area-inset-left))]
          md:pr-[max(1.5rem,env(safe-area-inset-right))]"
      >
        <picture>
          <source srcSet="/brand/wordmark-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/wordmark-light.svg" alt="Wolfchatter" className="h-5 w-auto md:h-6" />
        </picture>
        <ConnectionIndicator status={connection} />
      </div>
    </header>
  );
}
