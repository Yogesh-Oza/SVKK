import { defineConfig, devices } from "@playwright/test";
import { loadE2eEnv } from "./load-env";

loadE2eEnv();

const baseURL = process.env.BASE_URL || "https://svkk.techui.co.in";
const headed = process.env.HEADED !== "0" && process.env.CI !== "true";

/**
 * SVKK live e2e — loads credentials/URL from `e2e/.env`.
 * Default: headed Chromium, one worker, fresh browser context per test.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 120 * 1000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: !headed,
    launchOptions: {
      slowMo: process.env.SLOW_MO ? Number(process.env.SLOW_MO) : headed ? 200 : 0,
    },
  },
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PW_CHANNEL || "chrome",
      },
    },
  ],
  outputDir: "test-results/",
});
