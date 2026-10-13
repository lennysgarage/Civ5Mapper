import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  build: { outDir: "../../dist/web", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  server: { host: "127.0.0.1" },
});
