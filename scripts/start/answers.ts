import type { RunMode } from "./run-mode.ts";
import type { TileSource, TileSourceChoice } from "./tile-source.ts";

export type Answers = {
  mode: RunMode;
  port: number;
  tiles: TileSource;
  databasePassword: string;
};

export const defaultPort = 3000;

/**
 * A prompt is only worth asking when someone can answer it: `--yes`, a CI runner and a
 * piped stdin all take every default instead, which is what `npm run dev` and CI rely on.
 */
export function shouldAskQuestions(takesDefaults: boolean, env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  if (takesDefaults) return false;
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

export function parseTileSourceAnswer(
  input: string,
  offered: readonly TileSourceChoice[],
): TileSource | undefined {
  const choice = Number.parseInt(input.trim(), 10);
  if (Number.isNaN(choice)) return undefined;
  return offered[choice - 1]?.source;
}

export function parsePortAnswer(input: string): number | undefined {
  if (!/^\d+$/.test(input.trim())) return undefined;
  const port = Number.parseInt(input.trim(), 10);
  return port >= 1 && port <= 65535 ? port : undefined;
}

/**
 * The floor is the runtime `package.json` asks for, and it is 22.18 because that is where
 * Node stopped flagging type stripping — below it the wizard and the server cannot be
 * loaded at all, whatever else is installed. Verified on 22.18, 24 and 25.
 */
export function isSupportedNodeVersion(version: string): boolean {
  const parsed = /^v?(\d+)\.(\d+)\./.exec(version);
  if (parsed === null) return false;
  const major = Number(parsed[1]);
  const minor = Number(parsed[2]);
  if (major > 22) return true;
  return major === 22 && minor >= 18;
}
