import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extractSave, validateWorld } from "../packages/core/src/index.js";
import { initRuleset, enrichWorld } from "../packages/core/src/ruleset.js";

const bytes = new Uint8Array(await readFile("examples/turn-132.Civ5Save"));
let rawWorld;
try {
  rawWorld = extractSave(bytes, { units: true });
} catch (error) {
  rawWorld = extractSave(bytes);
  rawWorld.extraction.warnings.push(
    "Army view unavailable: " + (error as Error).message,
  );
}
await initRuleset(new Uint8Array(await readFile("assets/wasm/sql-wasm.wasm")));
const world = enrichWorld(rawWorld, {
  ruleset: new Uint8Array(await readFile("assets/databases/ruleset.db")),
  localization: new Uint8Array(
    await readFile("assets/databases/localization.db"),
  ),
  religionMetadataTrusted: false,
});
validateWorld(rawWorld);
validateWorld(world);
await mkdir("assets/examples", { recursive: true });
await writeFile(
  "assets/examples/turn-132.json",
  JSON.stringify({ rawWorld, world }) + "\n",
);
