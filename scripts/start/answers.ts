import type { RunMode } from "./run-mode.ts";

export type Answers = {
  mode: RunMode;
  port: number;
  databasePassword: string;
};

export const defaultPort = 3000;

/**
 * A prompt is only worth asking when someone can answer it: `--yes`, a CI runner and a
 * piped stdin all take every default instead, which is what `npm run dev` and CI rely on.
 */
export function shouldAskQuestions(argv: readonly string[], env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  if (argv.includes("--yes") || argv.includes("-y")) return false;
  if (env.CI !== undefined && env.CI !== "" && env.CI !== "false") return false;
  return isTty;
}

export function parseRunModeAnswer(
  input: string,
  offered: readonly { mode: RunMode }[],
): RunMode | undefined {
  const choice = Number.parseInt(input.trim(), 10);
  if (Number.isNaN(choice)) return undefined;
  return offered[choice - 1]?.mode;
}

export function parsePortAnswer(input: string): number | undefined {
  if (!/^\d+$/.test(input.trim())) return undefined;
  const port = Number.parseInt(input.trim(), 10);
  return port >= 1 && port <= 65535 ? port : undefined;
}

/** Node 24.16 is where `crypto.randomUUIDv7()` lands, and the server uses it for message ids. */
export function isSupportedNodeVersion(version: string): boolean {
  const parsed = /^v?(\d+)\.(\d+)\./.exec(version);
  if (parsed === null) return false;
  const major = Number(parsed[1]);
  const minor = Number(parsed[2]);
  if (major > 24) return true;
  return major === 24 && minor >= 16;
}
