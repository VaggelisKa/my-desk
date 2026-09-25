import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BASE_URL,
  CRON_LOG_FILE,
  DATABASE_URL,
  PORT,
  TIMEZONE,
} from "./e2e/support/env";

export default defineConfig({
  testDir: "./e2e",
  // All tests share one web server and one SQLite database that is reset
  // before every test, so they have to run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",

  use: {
    baseURL: BASE_URL,
    locale: "en-US",
    timezoneId: TIMEZONE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "warmup", testMatch: /warmup\.setup\.ts/ },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["warmup"],
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    // Build a fresh local database, then start the dev server with the preload
    // that pins the clock and stubs outbound requests.
    command: `node e2e/support/prepare-db.mjs && node node_modules/@react-router/dev/bin.cjs dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Never attach to an already running dev server: it could be connected to
    // the real database.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      E2E_PORT: String(PORT),
      DATABASE_URL,
      E2E_CRON_LOG: CRON_LOG_FILE,
      // Ignored for local files, but required by the app's startup checks.
      DATABASE_AUTH_TOKEN: "e2e-local",
      CRON_TOKEN: "e2e-cron-token",
      CRON_PASSWORD: "e2e-cron-password",
      SESSION_SECRET: "e2e-session-secret-for-local-tests-only",
      E2E_NOW: process.env.E2E_NOW!,
      TZ: TIMEZONE,
      // Through NODE_OPTIONS rather than a CLI flag: the react-router CLI
      // relaunches itself in a child process, which only inherits the env.
      NODE_OPTIONS: `--import=${pathToFileURL(resolve("e2e/support/server-preload.mjs")).href}`,
    },
  },
});
