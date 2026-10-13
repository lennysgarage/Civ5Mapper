import { MAX_INPUT, type World } from "./index.js";
import { initRuleset, enrichWorld, type Databases } from "./ruleset.js";

export interface MetadataInputs {
  assetBase: string;
  bundledMetadata?: boolean;
  ruleset?: { bytes: ArrayBuffer } | null;
  localization?: { bytes: ArrayBuffer } | null;
}
export function metadataNeeds(world: World) {
  return {
    cityNames: world.cities.filter(
      (c) => typeof c.name === "string" && c.name.startsWith("TXT_KEY_"),
    ).length,
    terrain: world.tiles.some((t) => !t.terrain),
    culture: Boolean(world.culture && !world.culture.thresholds),
    military: Boolean(world.units?.some((u) => u.classificationKnown !== true)),
  };
}
const downloads = new Map<string, Promise<Uint8Array>>();
async function asset(url: string) {
  if (!downloads.has(url)) {
    const pending = (async () => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Could not load bundled metadata (${response.status})`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (!data.length || data.length > MAX_INPUT)
        throw new Error("Metadata size limit exceeded");
      return data;
    })();
    downloads.set(url, pending);
    pending.catch(() => downloads.delete(url));
  }
  return downloads.get(url)!;
}
export async function enrichBrowserWorld(
  world: World,
  inputs: MetadataInputs,
): Promise<World> {
  const needs = metadataNeeds(world);
  // Fully normalized JSON keeps its supplied names and metadata. Replay-only
  // rosters do not have the save's ruleset identities and cannot be enriched.
  const useDefault =
    inputs.bundledMetadata !== false &&
    (world.source.kind === "save" ||
      (needs.culture &&
        world.civilizations.every(
          (c) => c.key && Number.isInteger(c.rulesetId),
        ))) &&
    (needs.cityNames > 0 || needs.terrain || needs.military || needs.culture);
  if (!inputs.ruleset && !inputs.localization && !useDefault) return world;
  const url = (name: string) => new URL(name, inputs.assetBase).href;
  const files: Databases = {};
  try {
    const [wasm, ruleset, localization] = await Promise.all([
      asset(url("wasm/sql-wasm.wasm")),
      inputs.ruleset
        ? new Uint8Array(inputs.ruleset.bytes)
        : useDefault
          ? asset(url("databases/ruleset.db"))
          : undefined,
      inputs.localization
        ? new Uint8Array(inputs.localization.bytes)
        : useDefault
          ? asset(url("databases/localization.db"))
          : undefined,
    ]);
    await initRuleset(wasm);
    files.ruleset = ruleset;
    files.localization = localization;
    return enrichWorld(world, files);
  } catch (error) {
    // Explicit overrides must fail rather than silently use another ruleset.
    if (inputs.ruleset || (!useDefault && inputs.localization)) throw error;
    const partial =
      inputs.localization && files.localization
        ? enrichWorld(world, { localization: files.localization })
        : structuredClone(world);
    partial.extraction.warnings.push(
      `Bundled metadata unavailable: ${(error as Error).message}. Choose matching ruleset and localization databases for this save.`,
    );
    return partial;
  }
}
