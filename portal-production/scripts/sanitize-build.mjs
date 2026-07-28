import { readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

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

await removeEnvironmentFiles(buildDirectory);
