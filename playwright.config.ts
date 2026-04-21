import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  timeout: 30000,
  retries: 0,
});
