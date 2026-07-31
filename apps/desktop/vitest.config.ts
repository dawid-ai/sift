import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@sift/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@sift/ipc-contract": resolve(__dirname, "../../packages/ipc-contract/src/index.ts"),
      "@sift/db/testing": resolve(__dirname, "../../packages/db/src/testing.ts"),
      "@sift/db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@sift/binaries": resolve(__dirname, "../../packages/binaries/src/index.ts"),
    },
  },
});
