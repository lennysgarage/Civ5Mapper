import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
await mkdir("dist/viewer", { recursive: true });
await build({
  entryPoints: ["packages/web/src/viewer.ts"],
  outfile: "dist/viewer/viewer.js",
  bundle: true,
  format: "iife",
  globalName: "CivViewer",
  target: "es2022",
});
await cp("assets/viewer.css", "dist/viewer/viewer.css");
await mkdir("assets/wasm", { recursive: true });
await cp("node_modules/sql.js/dist/sql-wasm.wasm", "assets/wasm/sql-wasm.wasm");
await cp(
  "node_modules/@resvg/resvg-wasm/index_bg.wasm",
  "assets/wasm/resvg.wasm",
);
await mkdir("assets/licenses", { recursive: true });
await cp("third_party", "assets/licenses/third_party", { recursive: true });
await cp("NOTICE", "assets/licenses/NOTICE");
await cp("LICENSE", "assets/licenses/LICENSE");
// Both production builds and predev regenerate the example from current code
// and bundled databases. The source save lives outside Vite's public directory.
await build({
  entryPoints: ["scripts/prepare_example.ts"],
  outfile: "dist/build/prepare-example.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
});
await import("../dist/build/prepare-example.mjs");
if (!process.argv.includes("--assets-only")) {
  await mkdir("dist/cli", { recursive: true });
  await build({
    entryPoints: ["packages/cli/src/main.ts"],
    outfile: "dist/cli/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    target: "node22",
    banner: { js: "#!/usr/bin/env node" },
  });
  await writeFile("dist/cli/package.json", '{"type":"module"}\n');
  const { build: buildWeb } = await import("vite");
  await buildWeb({ configFile: "packages/web/vite.config.ts" });
}
