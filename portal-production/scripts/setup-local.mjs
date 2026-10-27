import { randomBytes } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const safeFailure = "Não foi possível criar a configuração local. Nenhum arquivo existente foi substituído e nenhum valor foi exibido.";

async function regularFileAlreadyExists(path) {
  try {
    const info = await lstat(path);
    if (info.isFile() && !info.isSymbolicLink()) return true;
    throw new Error(safeFailure);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function setupLocalEnvironment(projectDirectory, { createRandomBytes = randomBytes } = {}) {
  const path = join(projectDirectory, ".env.local");
  try {
    // Inspect metadata only. Never read, copy or rewrite an existing env file,
    // production configuration, local database or Cloudflare credentials.
    if (await regularFileAlreadyExists(path)) return { created: false };
    const appSecret = createRandomBytes(32).toString("hex");
    const setupSecret = createRandomBytes(32).toString("hex");
    const content = [
      "# Somente desenvolvimento local com dados sintéticos. Nunca usar em produção.",
      `APP_SECRET=${appSecret}`,
      `SETUP_SECRET=${setupSecret}`,
      "PUBLIC_SITE_URL=https://psico-mateus.github.io/",
      "GUIDE_URL=https://psico-mateus.github.io/guia-emocoes/",
      "",
    ].join("\n");
    try {
      // Exclusive creation also closes the race after the metadata check.
      // On Windows, filesystem ACLs remain the operating system's authority.
      await writeFile(path, content, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code === "EEXIST" && await regularFileAlreadyExists(path)) {
        return { created: false };
      }
      throw error;
    }
    return { created: true };
  } catch {
    throw new Error(safeFailure);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error(safeFailure);
    const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
    const result = await setupLocalEnvironment(projectDirectory);
    console.log(result.created
      ? "Configuração local criada com segredos novos de desenvolvimento. Nenhum valor foi exibido."
      : "A configuração local já existe. Nada foi lido ou alterado.");
  } catch {
    console.error(safeFailure);
    process.exitCode = 1;
  }
}
