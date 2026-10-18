import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "browser.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.TEST_ORIGIN ?? "http://127.0.0.1:8787",
    channel: "chrome",
    viewport: { width: 1440, height: 1050 },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
