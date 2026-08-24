import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("build sanitization gives the service worker a deterministic client fingerprint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "area-paciente-build-"));
  const buildDirectory = join(directory, "dist");
  const clientDirectory = join(buildDirectory, "client");
  const assetPath = join(clientDirectory, "assets", "app.js");
  const serviceWorkerPath = join(clientDirectory, "sw.js");
  const serverPath = join(buildDirectory, "server", "index.js");
  const environmentPath = join(buildDirectory, "server", ".env");
  const scriptPath = fileURLToPath(
    new URL("../scripts/sanitize-build.mjs", import.meta.url),
  );

  try {
    await mkdir(join(clientDirectory, "assets"), { recursive: true });
    await mkdir(join(buildDirectory, "server"), { recursive: true });
    await writeFile(assetPath, "export const version = 1;\n", "utf8");
    const originalWorker =
      'self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));\r\n';
    await writeFile(serviceWorkerPath, originalWorker, "utf8");
    await writeFile(serverPath, "export const apiVersion = 1;\n", "utf8");
    await writeFile(environmentPath, "APP_SECRET=never-ship\n", "utf8");

    const executeSanitizer = () =>
      run(process.execPath, [scriptPath], {
        cwd: directory,
      });

    await executeSanitizer();
    const firstWorker = await readFile(serviceWorkerPath, "utf8");
    assert.match(firstWorker, /^\/\/ area-do-paciente-client-build:[a-f0-9]{16}\n/u);
    assert.equal(firstWorker.replace(/^.*\n/u, ""), originalWorker);
    await assert.rejects(readFile(environmentPath, "utf8"), { code: "ENOENT" });

    await executeSanitizer();
    assert.equal(await readFile(serviceWorkerPath, "utf8"), firstWorker);

    await writeFile(serverPath, "export const apiVersion = 2;\n", "utf8");
    await executeSanitizer();
    assert.equal(await readFile(serviceWorkerPath, "utf8"), firstWorker);

    await writeFile(assetPath, "export const version = 2;\n", "utf8");
    await executeSanitizer();
    const secondWorker = await readFile(serviceWorkerPath, "utf8");
    assert.notEqual(secondWorker, firstWorker);
    assert.doesNotMatch(secondWorker, /caches\./u);
    assert.equal(secondWorker.match(/area-do-paciente-client-build/g)?.length, 1);

    const renamedAssetPath = join(clientDirectory, "assets", "renamed-app.js");
    await rename(assetPath, renamedAssetPath);
    await executeSanitizer();
    assert.notEqual(await readFile(serviceWorkerPath, "utf8"), secondWorker);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("build sanitization fails before cleanup when the service worker is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "area-paciente-build-missing-sw-"));
  const environmentPath = join(directory, "dist", "server", ".env");
  const scriptPath = fileURLToPath(
    new URL("../scripts/sanitize-build.mjs", import.meta.url),
  );

  try {
    await mkdir(join(directory, "dist", "client"), { recursive: true });
    await mkdir(join(directory, "dist", "server"), { recursive: true });
    await writeFile(environmentPath, "APP_SECRET=keep-until-build-is-valid\n", "utf8");

    await assert.rejects(
      run(process.execPath, [scriptPath], { cwd: directory }),
      /dist\/client\/sw\.js/u,
    );
    assert.equal(
      await readFile(environmentPath, "utf8"),
      "APP_SECRET=keep-until-build-is-valid\n",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
