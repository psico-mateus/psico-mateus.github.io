import { createHash } from "node:crypto";
import { readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const buildDirectory = resolve("dist");
const forbiddenNames = new Set([
  ".dev.vars",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]);

async function removeEnvironmentFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await removeEnvironmentFiles(path);
        return;
      }

      if (forbiddenNames.has(entry.name)) {
        await unlink(path);
      }
    }),
  );
}

async function listBuildFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listBuildFiles(path) : [path];
    }),
  );
  return files.flat();
}

async function stampServiceWorker(directory) {
  const clientDirectory = resolve(directory, "client");
  const serviceWorkerPath = resolve(clientDirectory, "sw.js");
  const normalizedRelativePath = (path) =>
    relative(clientDirectory, path).replaceAll("\\", "/");
  const files = (await listBuildFiles(clientDirectory))
    .filter((path) => path !== serviceWorkerPath)
    .sort((left, right) => {
      const leftPath = normalizedRelativePath(left);
      const rightPath = normalizedRelativePath(right);
      return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });

  const serviceWorker = await readFile(serviceWorkerPath, "utf8");

  const fingerprint = createHash("sha256");
  for (const path of files) {
    fingerprint.update(normalizedRelativePath(path));
    fingerprint.update("\0");
    fingerprint.update(await readFile(path));
    fingerprint.update("\0");
  }

  const unstampedWorker = serviceWorker.replace(
    /^\/\/ area-do-paciente-client-build:[a-f0-9]{16}\r?\n/u,
    "",
  );
  const buildId = fingerprint.digest("hex").slice(0, 16);
  await writeFile(
    serviceWorkerPath,
    `// area-do-paciente-client-build:${buildId}\n${unstampedWorker}`,
    "utf8",
  );
}

const serviceWorkerStat = await stat(resolve(buildDirectory, "client", "sw.js"));
if (!serviceWorkerStat.isFile()) {
  throw new Error("O build não gerou dist/client/sw.js como arquivo.");
}
await removeEnvironmentFiles(buildDirectory);
await stampServiceWorker(buildDirectory);
