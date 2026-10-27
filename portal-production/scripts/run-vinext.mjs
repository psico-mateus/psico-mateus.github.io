import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicWorkerFlag = "CLOUDFLARE_PUBLIC_DEPLOY=1";
const allowedCommands = new Set(["dev", "build", "start"]);
const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };

export function resolveVinextCli() {
  // Resolve the installed package, not an OS-specific node_modules/.bin shim.
  // vinext 1.0.1 exports dist/index.js; its bin is the adjacent dist/cli.js.
  return fileURLToPath(new URL("./cli.js", import.meta.resolve("vinext")));
}

export function createVinextPlan(argumentsList, environment, cliPath) {
  const argumentsCopy = [...argumentsList];
  const publicWorker = argumentsCopy[0] === publicWorkerFlag;
  if (publicWorker) argumentsCopy.shift();
  const command = argumentsCopy.shift();
  if (!allowedCommands.has(command) || (publicWorker && command !== "build")) {
    throw new Error("Use dev, build ou start; o modo público é exclusivo do build.");
  }

  const childEnvironment = { ...environment, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" };
  if (publicWorker) childEnvironment.CLOUDFLARE_PUBLIC_DEPLOY = "1";
  const steps = [[cliPath, command, ...argumentsCopy]];
  if (command === "build") {
    steps.push([fileURLToPath(new URL("./sanitize-build.mjs", import.meta.url))]);
  }
  return { environment: childEnvironment, steps };
}

export async function executeVinextPlan(plan, {
  spawnProcess = spawn,
  signalSource = process,
  executable = process.execPath,
  cwd = process.cwd(),
} = {}) {
  let interruptedSignal;
  let child;
  const forwardSignal = signal => {
    interruptedSignal ??= signal;
    try { child?.kill(signal); }
    catch { /* The child can already have closed during terminal cancellation. */ }
  };
  const onInterrupt = () => forwardSignal("SIGINT");
  const onTerminate = () => forwardSignal("SIGTERM");
  signalSource.on("SIGINT", onInterrupt);
  signalSource.on("SIGTERM", onTerminate);
  try {
    for (const argumentsList of plan.steps) {
      if (interruptedSignal) return signalExitCodes[interruptedSignal];
      const result = await new Promise(resolveResult => {
        try {
          child = spawnProcess(executable, argumentsList, {
            cwd, env: plan.environment, stdio: "inherit", shell: false,
          });
          child.once("error", () => resolveResult({ code: 1 }));
          child.once("close", (code, signal) => resolveResult({ code, signal }));
          if (interruptedSignal) forwardSignal(interruptedSignal);
        } catch {
          resolveResult({ code: 1 });
        }
      });
      child = undefined;
      if (interruptedSignal) return signalExitCodes[interruptedSignal];
      if (result.signal) return signalExitCodes[result.signal] ?? 1;
      if (result.code !== 0) return result.code ?? 1;
    }
    return 0;
  } finally {
    signalSource.removeListener("SIGINT", onInterrupt);
    signalSource.removeListener("SIGTERM", onTerminate);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const plan = createVinextPlan(process.argv.slice(2), process.env, resolveVinextCli());
    process.exitCode = await executeVinextPlan(plan);
  } catch {
    // Never print the inherited environment or command arguments on failure.
    console.error("Não foi possível iniciar o comando local do portal. Confira as dependências e o comando.");
    process.exitCode = 1;
  }
}
