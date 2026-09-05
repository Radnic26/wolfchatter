import type { RunModeChoice } from "./run-mode.ts";

export function renderRunModeQuestion(offered: readonly RunModeChoice[]): string {
  const lines = offered.map((choice, index) => `  ${index + 1}) ${choice.label} — ${choice.detail}`);
  return ["How should Wolfchatter run?", ...lines].join("\n");
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
