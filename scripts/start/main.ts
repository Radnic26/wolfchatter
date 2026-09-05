import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  type Answers,
  defaultPort,
  isSupportedNodeVersion,
  parsePortAnswer,
  parseRunModeAnswer,
  shouldAskQuestions,
} from "./answers.ts";
import { renderEnvFile } from "./env-file.ts";
import { planStart } from "./plan.ts";
import { renderDockerMissingNotice, renderReady, renderRunModeQuestion } from "./prompts.ts";
import { defaultRunMode, offeredRunModes, usesDockerDatabase } from "./run-mode.ts";

const projectRoot = new URL("../../", import.meta.url);

function isDockerRunning(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function run(command: readonly string[]): void {
  const [program, ...args] = command;
  if (program === undefined) return;
  const result = spawnSync(program, args, { stdio: "inherit", cwd: projectRoot });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runLast(command: readonly string[]): void {
  const [program, ...args] = command;
  if (program === undefined) return;
  const child = spawn(program, args, { stdio: "inherit", cwd: projectRoot });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function ask(hasDocker: boolean): Promise<Answers> {
  const offered = offeredRunModes(hasDocker);
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  if (!hasDocker) console.log(renderDockerMissingNotice());
  console.log(renderRunModeQuestion(offered));

  const modeInput = await readline.question(`Choose [1]: `);
  const mode = parseRunModeAnswer(modeInput, offered) ?? defaultRunMode(hasDocker);

  const portInput = await readline.question(`Port for the API [${defaultPort}]: `);
  const port = parsePortAnswer(portInput) ?? defaultPort;

  readline.close();
  return { mode, port, databasePassword: crypto.randomUUID() };
}

if (!isSupportedNodeVersion(process.version)) {
  console.error(`Wolfchatter needs Node 24.16 or newer; this is ${process.version}.`);
  process.exit(1);
}

const hasDocker = isDockerRunning();
const answers = shouldAskQuestions(process.argv.slice(2), process.env, process.stdin.isTTY === true)
  ? await ask(hasDocker)
  : { mode: defaultRunMode(hasDocker), port: defaultPort, databasePassword: crypto.randomUUID() };

// 0600: the file holds the database password this run just generated.
writeFileSync(new URL(".env", projectRoot), renderEnvFile(answers), { mode: 0o600 });

if (!usesDockerDatabase(answers.mode)) console.log("Using the embedded database in ./data/pg");

run(["npm", "install"]);

const plan = planStart(answers);
console.log(renderReady(plan.url, plan.reloads));

for (const command of plan.commands.slice(0, -1)) run(command);
runLast(plan.commands[plan.commands.length - 1] ?? []);
