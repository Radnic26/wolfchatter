import type { ConnectionStatus } from "@wolfchatter/shared/client";
import { ConnectionIndicator } from "./connection-indicator.tsx";

/**
 * The wordmark carries its own theme: `<picture>` picks the file, so there is no second
 * copy of the image hidden behind a class and no flash of the wrong one.
 */
export function AppHeader({ connection }: { connection: ConnectionStatus }) {
  return (
    <header className="shrink-0 border-rule border-b bg-ground pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 items-center gap-3 px-4 md:h-14 md:px-6">
        <picture>
          <source srcSet="/brand/wordmark-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/wordmark-light.svg" alt="Wolfchatter" className="h-5 w-auto md:h-6" />
        </picture>
        <ConnectionIndicator status={connection} />
      </div>
    </header>
  );
}
