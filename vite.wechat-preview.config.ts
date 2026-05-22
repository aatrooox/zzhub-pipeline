import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    outDir: resolve(__dirname, "src/wechat-preview/assets/browser-dist"),
    emptyOutDir: true,
    manifest: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/wechat-preview/browser/editor-export.ts"),
      output: {
        inlineDynamicImports: true,
        entryFileNames: "editor-export.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
