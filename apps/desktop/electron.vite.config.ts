import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const siftAliases = {
  "@sift/core": resolve(__dirname, "../../packages/core/src/index.ts"),
  "@sift/ipc-contract": resolve(
    __dirname,
    "../../packages/ipc-contract/src/index.ts",
  ),
  "@sift/db": resolve(__dirname, "../../packages/db/src/index.ts"),
  "@sift/binaries": resolve(__dirname, "../../packages/binaries/src/index.ts"),
};

export default defineConfig({
  main: {
    resolve: { alias: { ...siftAliases } },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    resolve: { alias: { ...siftAliases } },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, "src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: { ...siftAliases, "@": resolve(__dirname, "src/renderer") },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    plugins: [react()],
  },
});
