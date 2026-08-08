import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: {
    command: "cd .. && vp dev",
    port: 5173,
    timeout: 30000,
    reuseExistingServer: true,
    cwd: "../",
  },
});
