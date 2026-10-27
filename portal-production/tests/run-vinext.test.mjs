import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, readFile } from "node:fs/promises";
import { basename } from "node:path";
import test from "node:test";
import { createVinextPlan, executeVinextPlan, resolveVinextCli } from "../scripts/run-vinext.mjs";

test("portable scripts use Node and preserve the public Worker flag without shell assignments", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const command of ["dev", "build", "start"]) {
    assert.equal(scripts[command], `node scripts/run-vinext.mjs ${command}`);
  }
  assert.equal(scripts["build:worker"], "node scripts/run-vinext.mjs CLOUDFLARE_PUBLIC_DEPLOY=1 build");
  assert.equal(scripts["deploy:worker"], "pnpm build:worker && wrangler deploy");
  const cli = resolveVinextCli();
  assert.equal(basename(cli), "cli.js");
  await access(cli);
});

test("command plans preserve literal arguments and do not mutate their source environment", () => {
  const environment = { PATH: "synthetic-path-only", WRANGLER_LOG_PATH: "old-log", PUBLIC_SITE_URL: "https://example.test/" };
  const input = ["dev", "--host", "127.0.0.1", "--port", "4321", "text & echo synthetic-only"];
  const originalArguments = [...input];
  const originalEnvironment = { ...environment };
  const plan = createVinextPlan(input, environment, "C:\\synthetic folder\\vinext\\cli.js");
  assert.deepEqual(plan.steps, [["C:\\synthetic folder\\vinext\\cli.js", ...input]]);
  assert.deepEqual(input, originalArguments);
  assert.deepEqual(environment, originalEnvironment);
  assert.notEqual(plan.environment, environment);
  assert.equal(plan.environment.PATH, "synthetic-path-only");
  assert.equal(plan.environment.WRANGLER_LOG_PATH, ".wrangler/wrangler.log");
  assert.equal(plan.environment.CLOUDFLARE_PUBLIC_DEPLOY, undefined);
});

test("build plans sanitize only after Vinext and public mode overrides only its known flag", () => {
  for (const publicWorker of [false, true]) {
    const environment = { CLOUDFLARE_PUBLIC_DEPLOY: "0", syntheticSetting: "preserved" };
    const plan = createVinextPlan([...(publicWorker ? ["CLOUDFLARE_PUBLIC_DEPLOY=1"] : []), "build", "--debug"], environment, "synthetic-vinext-cli.js");
    assert.equal(plan.environment.CLOUDFLARE_PUBLIC_DEPLOY, publicWorker ? "1" : "0");
    assert.equal(plan.environment.syntheticSetting, "preserved");
    assert.deepEqual(plan.steps[0], ["synthetic-vinext-cli.js", "build", "--debug"]);
    assert.equal(plan.steps[1].length, 1);
    assert.equal(basename(plan.steps[1][0]), "sanitize-build.mjs");
  }
  assert.equal(createVinextPlan(["start"], {}, "synthetic-vinext-cli.js").steps.length, 1);
});

test("plans reject arbitrary environment assignments, unknown commands and public dev/start", () => {
  for (const argumentsList of [[], ["deploy"], ["APP_SECRET=synthetic-only", "build"], ["CLOUDFLARE_PUBLIC_DEPLOY=0", "build"], ["CLOUDFLARE_PUBLIC_DEPLOY=1", "dev"], ["CLOUDFLARE_PUBLIC_DEPLOY=1", "start"]]) {
    assert.throws(() => createVinextPlan(argumentsList, {}, "synthetic-vinext-cli.js"), /Use dev, build ou start/u);
  }
});

function syntheticRunner(outcomes, { emitSignal } = {}) {
  const calls = [];
  const signals = new EventEmitter();
  const childSignals = [];
  return {
    calls, signals, childSignals,
    spawnProcess(executable, argumentsList, options) {
      calls.push({ executable, argumentsList, options });
      const outcome = outcomes[calls.length - 1];
      if (outcome?.throws) throw new Error("Synthetic spawn failure only.");
      const child = new EventEmitter();
      child.kill = signal => { childSignals.push(signal); return true; };
      queueMicrotask(() => {
        if (emitSignal) signals.emit(emitSignal);
        if (outcome?.error) child.emit("error", new Error("Synthetic child failure only."));
        else child.emit("close", outcome?.code ?? 0, outcome?.signal ?? null);
      });
      return child;
    },
  };
}

test("execution runs Node directly without a shell and sanitizes successful builds in order", async () => {
  const plan = createVinextPlan(["CLOUDFLARE_PUBLIC_DEPLOY=1", "build", "literal & argument"], { synthetic: "only" }, "C:\\folder with spaces\\cli.js");
  const fixture = syntheticRunner([{ code: 0 }, { code: 0 }]);
  assert.equal(await executeVinextPlan(plan, { spawnProcess: fixture.spawnProcess, signalSource: fixture.signals, executable: "C:\\node folder\\node.exe", cwd: "C:\\synthetic project" }), 0);
  assert.equal(fixture.calls.length, 2);
  for (let index = 0; index < fixture.calls.length; index++) {
    const call = fixture.calls[index];
    assert.equal(call.executable, "C:\\node folder\\node.exe");
    assert.deepEqual(call.argumentsList, plan.steps[index]);
    assert.deepEqual(call.options, { cwd: "C:\\synthetic project", env: plan.environment, stdio: "inherit", shell: false });
  }
  assert.equal(fixture.signals.listenerCount("SIGINT"), 0);
  assert.equal(fixture.signals.listenerCount("SIGTERM"), 0);
});

test("failed or signalled builds preserve failure status and never run the sanitizer", async () => {
  const plan = createVinextPlan(["build"], {}, "synthetic-vinext-cli.js");
  for (const [outcome, expected] of [[{ code: 17 }, 17], [{ signal: "SIGTERM" }, 143], [{ signal: "SIGKILL" }, 1], [{ error: true }, 1], [{ throws: true }, 1]]) {
    const fixture = syntheticRunner([outcome]);
    assert.equal(await executeVinextPlan(plan, { spawnProcess: fixture.spawnProcess, signalSource: fixture.signals }), expected);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.signals.listenerCount("SIGINT"), 0);
    assert.equal(fixture.signals.listenerCount("SIGTERM"), 0);
  }
});

test("terminal interruption is forwarded, clears listeners and prevents a later pipeline step", async () => {
  for (const [signal, expected] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const plan = createVinextPlan(["build"], {}, "synthetic-vinext-cli.js");
    const fixture = syntheticRunner([{ code: 0 }], { emitSignal: signal });
    assert.equal(await executeVinextPlan(plan, { spawnProcess: fixture.spawnProcess, signalSource: fixture.signals }), expected);
    assert.deepEqual(fixture.childSignals, [signal]);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.signals.listenerCount("SIGINT"), 0);
    assert.equal(fixture.signals.listenerCount("SIGTERM"), 0);
  }
});
