import { defineConfig } from "@playwright/test";

const PORT = 3100;
const TEST_DB =
  process.env.DATABASE_URL_TEST ??
  "postgres://compramais:compramais@localhost:5433/compramais_test";

// O e2e sobe o app contra o banco de teste e recria o schema a cada rodada.
Object.assign(process.env, {
  DATABASE_URL: TEST_DB,
  DATABASE_URL_TEST: TEST_DB,
  SESSION_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
  STORAGE_DIR: "./storage-test",
  JOB_RUNNER: "inline",
});

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    // permite usar um Chromium já instalado (ex.: PW_CHROMIUM_PATH=/usr/bin/chromium) sem baixar outro
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
