/** Local corpus checks. Inputs are read only; private reports remain ignored. */
import { Command } from "commander";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  extractSave,
  parseReplay,
  parseSaveReplay,
  loadMapJson,
  MAX_INPUT,
} from "../dist/core/src/index.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function files(directory, suffix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    const p = path.join(directory, e.name);
    if (e.isDirectory()) result.push(...(await files(p, suffix)));
    else if (e.isFile() && p.toLowerCase().endsWith(suffix)) result.push(p);
  }
  return result.sort();
}
const canonical = (p) => (existsSync(p) ? realpathSync(p) : path.resolve(p));
async function read(p) {
  if ((await stat(p)).size > MAX_INPUT)
    throw new Error("input size limit exceeded");
  return new Uint8Array(await readFile(p));
}
export async function validate(kind) {
  const command = new Command()
    .argument("<input>")
    .requiredOption("-o, --output <file>");
  if (kind === "units") command.option("--ruleset <file>");
  if (kind === "replays")
    command.option("--embedded", "validate embedded save replay logs");
  command.parse();
  const [input] = command.args,
    o = command.opts();
  try {
    const sources =
      kind === "map"
        ? [input]
        : await files(
            input,
            kind === "replays" && !o.embedded ? ".civ5replay" : ".civ5save",
          );
    if (!sources.length) throw new Error("no matching input files found");
    if (
      [...sources, o.ruleset]
        .filter(Boolean)
        .some((p) => canonical(p) === canonical(o.output))
    )
      throw new Error("report path must differ from inputs");
    const database = o.ruleset ? await read(o.ruleset) : undefined;
    if (database)
      await initRuleset(
        await read(new URL("../assets/wasm/sql-wasm.wasm", import.meta.url)),
      );
    const results = [];
    for (const [index, file] of sources.entries()) {
      const record = {
        file: kind === "map" ? path.basename(file) : path.relative(input, file),
      };
      try {
        const data = await read(file);
        record.sha256 = hash(data);
        if (kind === "replays") {
          const r = o.embedded ? parseSaveReplay(data) : parseReplay(data);
          Object.assign(record, {
            status: "passed",
            profile: r.inspection.eventProfile,
            events: r.events.length,
            datasets: r.datasets?.length ?? null,
            width: r.game.width,
            height: r.game.height,
          });
        } else if (kind === "map") {
          const doc = JSON.parse(new TextDecoder().decode(data)),
            world = loadMapJson(doc),
            m = doc.MapData;
          if (!m) throw new Error("comparison requires scenario MapData JSON");
          const locations = new Set(world.cities.map((c) => `${c.x},${c.y}`));
          for (const t of world.tiles) {
            const raw = m.MapTiles[t.y][t.x],
              imp = m.MapTileImprovements[t.y][t.x];
            if (
              t.terrainId !== raw.TerrainType ||
              t.elevation !== ["flat", "hills", "mountain"][raw.Elevation] ||
              t.landWater !==
                (["TERRAIN_OCEAN", "TERRAIN_COAST"].includes(
                  m.TerrainList[raw.TerrainType],
                )
                  ? "water"
                  : "land") ||
              t.owner !==
                ([-1, 255, 65535, 4294967295].includes(imp.Owner)
                  ? null
                  : imp.Owner) ||
              locations.has(`${t.x},${t.y}`) !== (imp.CityId !== -1)
            )
              throw new Error(`geography/politics mismatch at ${t.x},${t.y}`);
          }
          Object.assign(record, {
            status: "passed",
            tiles: world.tiles.length,
            cities: world.cities.length,
            civilizations: world.civilizations.length,
            geographyAndPolitics: "passed",
            pixelParity:
              "not claimed; atlas SVG differs from the reference raster",
          });
        } else {
          let w = extractSave(data, { units: kind === "units" });
          if (database) w = enrichWorld(w, { ruleset: database });
          const major = new Set(
            w.civilizations.filter((c) => c.kind === "major").map((c) => c.id),
          );
          Object.assign(record, {
            status: "passed",
            turn: w.game.turn,
            mode: w.inspection.header.mode,
            profile: w.inspection.profile,
            width: w.game.width,
            height: w.game.height,
            tiles: w.tiles.length,
            cities: w.cities.length,
            capitals: w.extraction.fields.capitals,
            knownCapitalCities: w.cities.filter((c) => c.capital === true)
              .length,
            unknownCapitalCities: w.cities.filter((c) => c.capital === null)
              .length,
            routeTiles: w.tiles.filter((t) => t.routeId !== null).length,
            pillagedRouteTiles: w.tiles.filter(
              (t) => t.routeId !== null && t.routePillaged === true,
            ).length,
            cityStateAlliances: w.extraction.fields.cityStateAlliances,
            knownCityStates: w.civilizations.filter(
              (c) => c.allianceKnown === true,
            ).length,
            alliedCityStates: w.civilizations.filter(
              (c) => c.allianceKnown && c.ally !== null,
            ).length,
          });
          if (kind === "units")
            Object.assign(record, {
              units: w.units.length,
              majorUnits: w.units.filter((u) => major.has(u.owner)).length,
              majorMilitaryUnits: database
                ? w.units.filter(
                    (u) => major.has(u.owner) && u.isMilitary === true,
                  ).length
                : null,
            });
        }
      } catch (e) {
        Object.assign(record, {
          status: kind === "replays" ? "unsupported" : "failed",
          error: e.message,
        });
      }
      results.push(record);
      if (index % 10 === 0)
        console.error(
          `${index + 1}/${sources.length}: ${path.basename(file)}: ${record.status}`,
        );
    }
    const result = {
      passed: results.filter((r) => r.status === "passed").length,
      total: results.length,
      results,
    };
    await writeFile(o.output, JSON.stringify(result, null, 2) + "\n");
    console.log(`${result.passed}/${result.total} passed. Report: ${o.output}`);
    if (kind !== "replays" && result.passed !== result.total)
      process.exitCode = 2;
  } catch (e) {
    console.error("error: " + e.message);
    process.exitCode = 2;
  }
}
