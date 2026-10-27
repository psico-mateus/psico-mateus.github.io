import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setupLocalEnvironment } from "../scripts/setup-local.mjs";

async function temporaryProject(t) {
  const directory = await mkdtemp(join(tmpdir(), "portal-setup-local-synthetic-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("local setup creates independent random development secrets and public URLs in a temporary project", async t => {
  const directory = await temporaryProject(t);
  assert.deepEqual(await setupLocalEnvironment(directory), { created: true });
  const path = join(directory, ".env.local");
  const content = await readFile(path, "utf8");
  const variables = Object.fromEntries(content.split("\n").filter(line => line && !line.startsWith("#")).map(line => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  assert.deepEqual(Object.keys(variables), ["APP_SECRET", "SETUP_SECRET", "PUBLIC_SITE_URL", "GUIDE_URL"]);
  assert.match(variables.APP_SECRET, /^[a-f0-9]{64}$/u);
  assert.match(variables.SETUP_SECRET, /^[a-f0-9]{64}$/u);
  assert.notEqual(variables.APP_SECRET, variables.SETUP_SECRET);
  assert.equal(variables.PUBLIC_SITE_URL, "https://psico-mateus.github.io/");
  assert.equal(variables.GUIDE_URL, "https://psico-mateus.github.io/guia-emocoes/");
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("existing local bytes and modification time are preserved without generating replacement secrets", async t => {
  const directory = await temporaryProject(t);
  const path = join(directory, ".env.local");
  const original = Buffer.from("# Synthetic fixture only\r\nAPP_SECRET=synthetic-existing-sentinel\r\n");
  await writeFile(path, original);
  const before = await stat(path, { bigint: true });
  let generated = false;
  assert.deepEqual(await setupLocalEnvironment(directory, { createRandomBytes() { generated = true; throw new Error("Must never generate replacements."); } }), { created: false });
  assert.equal(generated, false);
  assert.deepEqual(await readFile(path), original);
  assert.equal((await stat(path, { bigint: true })).mtimeNs, before.mtimeNs);
});

test("local setup refuses a symbolic link without changing its synthetic target", async t => {
  const directory = await temporaryProject(t);
  const target = join(directory, "synthetic-target.txt");
  const original = "Synthetic target; never overwrite.\n";
  await writeFile(target, original);
  try {
    await symlink(target, join(directory, ".env.local"));
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("Windows requires permission to create the synthetic symlink fixture.");
      return;
    }
    throw error;
  }
  await assert.rejects(setupLocalEnvironment(directory), /Nenhum arquivo existente foi substituído/u);
  assert.equal(await readFile(target, "utf8"), original);
});

test("local setup refuses a directory at the env path without modifying it", async t => {
  const directory = await temporaryProject(t);
  const envDirectory = join(directory, ".env.local");
  await mkdir(envDirectory);
  await writeFile(join(envDirectory, "synthetic-sentinel.txt"), "keep");
  await assert.rejects(setupLocalEnvironment(directory), /Nenhum arquivo existente foi substituído/u);
  assert.equal(await readFile(join(envDirectory, "synthetic-sentinel.txt"), "utf8"), "keep");
});

test("a missing parent produces a fixed failure without exposing the path", async t => {
  const directory = await temporaryProject(t);
  const privateSentinel = "synthetic-private-path-sentinel";
  await assert.rejects(setupLocalEnvironment(join(directory, privateSentinel, "absent")), error => {
    assert.match(error.message, /nenhum valor foi exibido/u);
    assert.equal(error.message.includes(privateSentinel), false);
    assert.equal(error.message.includes(directory), false);
    return true;
  });
});

test("random-source failure is reported safely and no env file is created", async t => {
  const directory = await temporaryProject(t);
  const privateSentinel = "synthetic-random-error-sentinel";
  await assert.rejects(setupLocalEnvironment(directory, { createRandomBytes() { throw new Error(privateSentinel); } }), error => {
    assert.match(error.message, /nenhum valor foi exibido/u);
    assert.equal(error.message.includes(privateSentinel), false);
    return true;
  });
  await assert.rejects(stat(join(directory, ".env.local")), { code: "ENOENT" });
});
