import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Offline regression guards for reviewed security floors, not a replacement for
// a fresh audit. In particular, braces has no published fix and is not hidden or
// required to disappear here. Override selectors may legitimately name an old
// version; inspect resolved packages rather than searching the entire YAML.
const [manifestText, workspace, lockfile] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"),
  readFile(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"),
]);
const manifest = JSON.parse(manifestText);

function stableVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(version);
  assert.ok(match, `Expected a stable resolved version, received ${version}`);
  return match.slice(1, 4).map(BigInt);
}

function atLeast(version, floor) {
  const actual = stableVersion(version);
  const minimum = stableVersion(floor);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

function resolvedPackages(yaml) {
  const lines = yaml.split(/\r?\n/u);
  const start = lines.indexOf("packages:");
  assert.ok(start >= 0, "pnpm lockfile must contain its resolved packages section");
  const packages = new Map();

  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/u.test(line)) break;
    const header = /^  (?:(['"])(.+)\1|([^'"\s].*)):\s*$/u.exec(line);
    if (!header) continue;
    const key = header[2] ?? header[3];
    const parsed = /^(.*)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/u.exec(key);
    assert.ok(parsed, `Unrecognized resolved package key: ${key}`);
    const [, name, version] = parsed;
    if (!packages.has(name)) packages.set(name, new Set());
    packages.get(name).add(version);
  }

  assert.ok(packages.size > 0, "Resolved package inventory must not be empty");
  return packages;
}

const packages = resolvedPackages(lockfile);

function assertFloor(name, floor, { required = true } = {}) {
  const versions = packages.get(name);
  if (required) assert.ok(versions?.size, `${name} must be present in the lockfile`);
  for (const version of versions ?? []) {
    assert.ok(atLeast(version, floor), `${name}@${version} is below reviewed security floor ${floor}`);
  }
}

test("stable version comparisons use numeric components and reject prereleases", () => {
  for (const [version, floor, expected] of [
    ["16.3.8", "16.3.8", true],
    ["16.3.7", "16.3.8", false],
    ["16.3.10", "16.3.8", true],
    ["16.4.0", "16.3.8", true],
    ["17.0.0", "16.3.8", true],
    ["15.99.99", "16.3.8", false],
    ["0.25.12", "0.25.0", true],
    ["0.28.0", "0.28.1", false],
    ["1.1.21+build.2", "1.1.21", true],
    ["1.1.20+build.99", "1.1.21", false],
  ]) {
    assert.equal(atLeast(version, floor), expected, `${version} >= ${floor}`);
  }
  for (const invalid of ["16.3.8-rc.1", "^16.3.8", "16.3", "01.2.3", "1.2.3junk", "1.2.3+"]) {
    assert.throws(() => stableVersion(invalid));
  }
});

test("package inventory ignores override selectors, nested fields and snapshots", () => {
  const inventory = resolvedPackages([
    "overrides:", "  fflate@0.7.3: 0.7.5", "packages:",
    "  '@vercel/og@1.0.3':", "    engines:", "      node: '>=22'",
    "  fflate@0.7.5:", "    resolution: {integrity: synthetic}",
    "snapshots:", "  fflate@0.7.3: {}", "  '@vercel/og@1.0.3(peer@1.0.0)':",
  ].join("\r\n"));
  assert.deepEqual([...inventory], [
    ["@vercel/og", new Set(["1.0.3"])],
    ["fflate", new Set(["0.7.5"])],
  ]);
  assert.throws(() => resolvedPackages("packages:\nsnapshots:\n"));
  assert.throws(() => resolvedPackages("overrides:\n  next: 16.3.8\n"));
});

test("Next and its ESLint config remain paired and runtime frameworks are production dependencies", () => {
  assert.equal(manifest.dependencies.next, manifest.devDependencies["eslint-config-next"]);
  assert.deepEqual(packages.get("next"), packages.get("eslint-config-next"));
  for (const name of ["vinext", "react-server-dom-webpack"]) {
    assert.ok(manifest.dependencies[name], `${name} is used by the deployed runtime`);
    assert.equal(manifest.devDependencies[name], undefined);
  }
  for (const name of ["react-dom", "react-server-dom-webpack"]) {
    assert.equal(manifest.dependencies[name], manifest.dependencies.react);
  }
  assertFloor("@vitejs/plugin-rsc", "0.5.34");
});

test("every resolved copy satisfies the reviewed patched dependency floors", () => {
  const floors = {
    next: "16.3.8",
    "eslint-config-next": "16.3.8",
    react: "19.2.8",
    "react-dom": "19.2.8",
    "react-server-dom-webpack": "19.2.8",
    vinext: "1.0.1",
    browserslist: "4.28.7",
    "baseline-browser-mapping": "2.11.0",
    sharp: "0.35.5",
    "source-map-js": "1.2.2",
    "fast-uri": "3.1.8",
    "js-yaml": "4.3.2",
    undici: "7.29.1",
    fflate: "0.7.5",
  };
  for (const [name, floor] of Object.entries(floors)) assertFloor(name, floor);
  // Vinext may remove this package entirely; an override alone must not count
  // as proof that a remaining resolved copy is safe.
  assertFloor("image-size", "2.0.3", { required: false });

  for (const [name] of packages) {
    if (name.startsWith("@next/swc-") || name === "@next/env") assertFloor(name, "16.3.8");
    if (name.startsWith("@img/sharp-libvips-")) assertFloor(name, "1.3.4");
    else if (name.startsWith("@img/sharp-")) assertFloor(name, "0.35.5");
  }
});

test("OG must itself carry corrected bundled Satori, not only a transitive override", () => {
  // @vercel/og prebundles Satori. Raising a separately installed satori cannot
  // rewrite an older OG bundle, so both package floors are required.
  assertFloor("@vercel/og", "1.0.3");
  assertFloor("satori", "0.33.5");
});

test("esbuild and brace-expansion preserve their separate patched version lines", () => {
  assert.ok(packages.get("esbuild")?.size);
  for (const version of packages.get("esbuild")) {
    assert.ok(atLeast(version, "0.25.0"), `esbuild@${version} predates the server-origin fix`);
    assert.ok(
      !atLeast(version, "0.27.3") || atLeast(version, "0.28.1"),
      `esbuild@${version} is inside the vulnerable Windows server range`,
    );
  }
  assert.ok(packages.get("brace-expansion")?.size);
  for (const version of packages.get("brace-expansion")) {
    const [major] = stableVersion(version);
    if (major === 1n) assert.ok(atLeast(version, "1.1.21"), `brace-expansion@${version}`);
    if (major >= 4n) assert.ok(atLeast(version, "5.0.12"), `brace-expansion@${version}`);
  }
});

test("dependency audit findings are not silently suppressed in project configuration", () => {
  for (const key of ["ignoreCves", "ignoreGhsas", "ignoreUnfixable", "ignoreRegistryErrors"]) {
    assert.equal(manifest.pnpm?.auditConfig?.[key], undefined, `Do not silently set auditConfig.${key}`);
  }
  assert.doesNotMatch(
    workspace,
    /^\s*["']?(?:ignoreCves|ignoreGhsas|ignoreUnfixable|ignoreRegistryErrors)["']?\s*:/imu,
  );
});
