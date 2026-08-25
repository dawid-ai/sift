import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors electron.vite.config.ts's renderer alias, so a renderer module under test
      // can import its own "@/..." paths instead of the test dictating its imports.
      "@": resolve(__dirname, "src/renderer"),
      "@sift/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@sift/ipc-contract": resolve(
        __dirname,
        "../../packages/ipc-contract/src/index.ts",
      ),
      "@sift/db/testing": resolve(
        __dirname,
        "../../packages/db/src/testing.ts",
      ),
      "@sift/db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@sift/binaries": resolve(
        __dirname,
        "../../packages/binaries/src/index.ts",
      ),
    },
  },
});
