import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const portalDirectory = new URL(".", import.meta.url).pathname;
const testDatabase = join(portalDirectory, "data", "portal-test.sqlite");

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4310",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PORTAL_PORT=4310 PORTAL_DB_PATH="${testDatabase}" PORTAL_RESET_DB=1 node --no-warnings=ExperimentalWarning server.mjs`,
    cwd: portalDirectory,
    port: 4310,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});

