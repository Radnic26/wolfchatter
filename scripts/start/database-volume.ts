import type { RunMode } from "./run-mode.ts";
import { usesDockerDatabase } from "./run-mode.ts";

export type VolumeCheck = {
  mode: RunMode;
  /** True when no password was carried over, so the one this run writes is freshly generated. */
  mintedNewPassword: boolean;
  /** The database volume left by an earlier run, if there is one. */
  volume: string | undefined;
};

/**
 * PostgreSQL reads POSTGRES_PASSWORD once, while it initialises its data directory, and
 * never again. So a volume left behind by an earlier run still answers to that run's
 * password, and a freshly generated one is locked out of it — the app exits on a
 * `password authentication failed` thrown from inside `pg`, which says nothing about
 * volumes and sends the reader looking in the wrong place.
 *
 * Deleting the volume is not ours to do: it holds whatever was said in those rooms. The
 * wizard stops and names the command, so the choice stays with the person running it.
 */
export function blocksOnStaleVolume({ mode, mintedNewPassword, volume }: VolumeCheck): boolean {
  return usesDockerDatabase(mode) && mintedNewPassword && volume !== undefined;
}

/**
 * The volume is named directly rather than cleared through `docker compose down -v`,
 * because this runs before `.env` exists and the compose file declares variables it cannot
 * do without — so the friendlier command would fail, and send someone into a second wall.
 */
export function renderStaleVolumeNotice(volume: string): string {
  return [
    "A database volume from an earlier run is still here, and it answers only to that run's",
    "password — PostgreSQL reads POSTGRES_PASSWORD when it first initialises and never again.",
    "This run would generate a new one, so the app would be refused by its own database.",
    "",
    "Delete the volume, and the rooms in it, then run this again:",
    `  docker volume rm ${volume}`,
    "",
    "To keep what is in it instead, put that run's POSTGRES_PASSWORD back into a .env here.",
  ].join("\n");
}
