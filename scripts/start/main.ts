import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  type Answers,
  defaultPort,
  isSupportedNodeVersion,
  parsePortAnswer,
  parseRunModeAnswer,
  shouldAskQuestions,
} from "./answers.ts";
import {
  embeddedDatabaseDirectory,
  planEnvFile,
  readDatabasePassword,
  readEnvFile,
  readPort,
  renderEnvFile,
  writeEnvFile,
} from "./env-file.ts";
import { parseFlags } from "./flags.ts";
import { localNetworkAddresses, networkUrls } from "./network.ts";
import { planStart } from "./plan.ts";
import { renderDockerMissingNotice, renderReady, renderRunModeQuestion, renderUsage } from "./prompts.ts";
import { defaultRunMode, offeredRunModes, usesDockerDatabase } from "./run-mode.ts";

const projectRoot = new URL("../../", import.meta.url);
const envFilePath = fileURLToPath(new URL(".env", projectRoot));

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

async function ask(
  hasDocker: boolean,
  databasePassword: string,
  networkAddresses: readonly string[],
): Promise<Answers> {
  const offered = offeredRunModes(hasDocker);
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  if (!hasDocker) console.log(renderDockerMissingNotice());
  console.log(renderRunModeQuestion(offered));

  const modeInput = await readline.question(`Choose [1]: `);
  const mode = parseRunModeAnswer(modeInput, offered) ?? defaultRunMode(hasDocker);

  const portInput = await readline.question(`Port for the API [${defaultPort}]: `);
  const port = parsePortAnswer(portInput) ?? defaultPort;

  readline.close();
  return { mode, port, databasePassword, networkAddresses };
}

if (!isSupportedNodeVersion(process.version)) {
  console.error(`Wolfchatter needs Node 22.18 or newer; this is ${process.version}. Try: nvm use 24`);
  process.exit(1);
}

const flags = parseFlags(process.argv.slice(2));
if (flags.printsUsage) {
  // A misread flag answers with the same text, on the stream and with the status that let a
  // script wrapping this tell it apart from a run that did what was asked.
  if (flags.carriesAnUnknownFlag) {
    console.error(renderUsage());
    process.exit(1);
  }

  console.log(renderUsage());
  process.exit(0);
}

const hasDocker = isDockerRunning();
const existingEnvFile = readEnvFile(envFilePath);
const envFilePlan = planEnvFile(existingEnvFile !== undefined, flags.rewritesEnvFile);
const databasePassword = readDatabasePassword(existingEnvFile) ?? crypto.randomUUID();
const networkAddresses = localNetworkAddresses(networkInterfaces());

const answered = shouldAskQuestions(flags.takesDefaults, process.env, process.stdin.isTTY === true)
  ? await ask(hasDocker, databasePassword, networkAddresses)
  : { mode: defaultRunMode(hasDocker), port: defaultPort, databasePassword, networkAddresses };

// A kept .env is the file the server and Vite will read, so the port in it is the one to print.
const answers = envFilePlan.writes
  ? answered
  : { ...answered, port: readPort(existingEnvFile) ?? answered.port };

console.log(envFilePlan.notice);
if (envFilePlan.writes) writeEnvFile(envFilePath, renderEnvFile(answers));

if (!usesDockerDatabase(answers.mode)) {
  console.log(`Using the embedded database in ${embeddedDatabaseDirectory}`);
}

run(["npm", "install"]);

const plan = planStart(answers);
console.log(renderReady(plan.url, plan.reloads, networkUrls(networkAddresses, plan.port)));

for (const command of plan.commands.slice(0, -1)) run(command);
runLast(plan.commands[plan.commands.length - 1] ?? []);
