/**
 * How the first run brings Wolfchatter up. The Docker modes need a working daemon, so a
 * machine without one is only offered `embedded`, which installs nothing and always works.
 */
export type RunMode = "docker" | "docker-database" | "embedded";

export type RunModeChoice = {
  mode: RunMode;
  label: string;
  detail: string;
};

const everyChoice: readonly RunModeChoice[] = [
  {
    mode: "docker",
    label: "Everything in Docker",
    detail: "the production image and PostgreSQL, closest to how it deploys",
  },
  {
    mode: "docker-database",
    label: "App here, PostgreSQL in Docker",
    detail: "hot reload against a real database",
  },
  {
    mode: "embedded",
    label: "Everything here, embedded database",
    detail: "nothing to install",
  },
];

export function offeredRunModes(hasDocker: boolean): readonly RunModeChoice[] {
  return hasDocker ? everyChoice : everyChoice.filter((choice) => choice.mode === "embedded");
}

export function defaultRunMode(hasDocker: boolean): RunMode {
  return hasDocker ? "docker" : "embedded";
}

export function usesDockerDatabase(mode: RunMode): boolean {
  return mode !== "embedded";
}
