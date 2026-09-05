import type { Answers } from "./answers.ts";

export type StartPlan = {
  commands: readonly (readonly string[])[];
  url: string;
  reloads: boolean;
};

const viteDevServer = "http://localhost:5173";

/**
 * The whole decision of a first run, as data: which commands to run, in order, and where
 * the app will be listening once they are done. Nothing here touches the filesystem.
 */
export function planStart(answers: Answers): StartPlan {
  if (answers.mode === "docker") {
    return {
      commands: [["docker", "compose", "up", "--build"]],
      url: `http://localhost:${answers.port}`,
      reloads: false,
    };
  }

  if (answers.mode === "docker-database") {
    return {
      commands: [
        ["docker", "compose", "up", "--detach", "db"],
        ["npm", "run", "dev"],
      ],
      url: viteDevServer,
      reloads: true,
    };
  }

  return { commands: [["npm", "run", "dev"]], url: viteDevServer, reloads: true };
}
