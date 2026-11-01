import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 8080);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", actionTimeout: 20_000, navigationTimeout: 30_000 },
  projects: [
    {
      name: "setup",
      testMatch: "open-setup.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop-web",
      testMatch: "open-core.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-web",
      testMatch: "open-core.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `bun run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
