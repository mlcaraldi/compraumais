import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const TEST_DB =
  process.env.DATABASE_URL_TEST ??
  "postgres://compramais:compramais@localhost:5433/compramais_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    env: {
      DATABASE_URL: TEST_DB,
      DATABASE_URL_TEST: TEST_DB,
      SESSION_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
      STORAGE_DIR: "./storage-test",
    },
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
