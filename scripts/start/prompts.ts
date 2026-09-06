import type { RunModeChoice } from "./run-mode.ts";
import type { TileSourceChoice } from "./tile-source.ts";

export function renderRunModeQuestion(offered: readonly RunModeChoice[]): string {
  const lines = offered.map((choice, index) => `  ${index + 1}) ${choice.label} — ${choice.detail}`);
  return ["How should Wolfchatter run?", ...lines].join("\n");
}

export function renderTileSourceQuestion(offered: readonly TileSourceChoice[]): string {
  const lines = offered.map((choice, index) => `  ${index + 1}) ${choice.label} — ${choice.detail}`);
  return ["Which map tiles?", ...lines].join("\n");
}

export function renderDockerMissingNotice(): string {
  return "Docker is not running, so only the embedded database is offered. Start Docker to get the other options.";
}

export function renderReady(url: string, reloads: boolean): string {
  const reload = reloads
    ? "Edits reload automatically."
    : "Running the production image; edits need a rebuild.";
  return `Wolfchatter is starting on ${url}\n${reload}\nPress Ctrl-C to stop.`;
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
