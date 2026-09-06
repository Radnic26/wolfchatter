import type { RunModeChoice } from "./run-mode.ts";

export function renderRunModeQuestion(offered: readonly RunModeChoice[]): string {
  const lines = offered.map((choice, index) => `  ${index + 1}) ${choice.label} — ${choice.detail}`);
  return ["How should Wolfchatter run?", ...lines].join("\n");
}

export function renderDockerMissingNotice(): string {
  return "Docker is not running, so only the embedded database is offered. Start Docker to get the other options.";
}

/**
 * The addresses are printed because the app is worth opening on a phone — the layout below
 * 768 px is a requirement, not a bonus — and nobody guesses their own address on the Wi-Fi.
 * They are only printed when they will work, which is why the wizard writes them into the
 * origin allowlist at the same time.
 */
export function renderReady(url: string, reloads: boolean, networkUrls: readonly string[]): string {
  const reload = reloads
    ? "Edits reload automatically."
    : "Running the production image; edits need a rebuild.";
  const onTheNetwork = networkUrls.map((address) => `  or ${address} — same Wi-Fi, try it on a phone`);
  return [`Wolfchatter is starting on ${url}`, ...onTheNetwork, reload, "Press Ctrl-C to stop."].join("\n");
}

export function renderUsage(): string {
  return [
    "Usage: ./start-wolfchatter [options]",
    "",
    "Asks how Wolfchatter should run, writes .env if there is none, installs and starts it.",
    "",
    "  -y, --yes          Take every default instead of asking, as CI and a piped stdin do.",
    "      --reconfigure  Write .env again from the answers, keeping the database password in it.",
    "      --help         Print this and stop.",
  ].join("\n");
}
