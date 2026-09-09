import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

/**
 * The role-dependent specs read their accounts from the environment. Loading the
 * local env files here is what lets them run without the credentials ever being
 * typed into a command line, a log, or this file. Nothing is read or printed:
 * the values only ever reach the browser through the sign-in form.
 */
nextEnv.loadEnvConfig(process.cwd());

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * The suite runs against a production build so it exercises the same rendering,
 * hydration, and proxy behaviour that ships. Point PLAYWRIGHT_BASE_URL at a
 * running dev server to iterate faster.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
