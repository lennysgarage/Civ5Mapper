import { Command, CommanderError } from "commander";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectSave,
  extractSave,
  renderSvg,
  parseMap,
  loadMapJson,
  parseReplay,
  parseSaveReplay,
  validateReplay,
  MAX_INPUT,
  PROFILES,
  type World,
} from "../../core/src/index.js";
import { initRuleset, enrichWorld } from "../../core/src/ruleset.js";
import { initRaster, rasterize, exportReplay } from "../../core/src/raster.js";
import { addTurnOnePlayers } from "../../core/src/history.js";
import { renderHtml } from "../../core/src/html.js";
import { STYLES, PRESETS } from "../../core/src/styles.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const assets = (name: string) => path.join(root, "assets", name);
async function readBytes(file: string) {
  const info = await stat(file);
  if (info.size > MAX_INPUT) throw new Error("input size limit exceeded");
  return new Uint8Array(await readFile(file));
}
function canonical(file: string): string {
  const absolute = path.resolve(file);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = path.dirname(absolute);
  return parent === absolute
    ? absolute
    : path.join(canonical(parent), path.basename(absolute));
}
function protect(inputs: string[], outputs: string[]) {
  const resolved = outputs.filter(Boolean).map(canonical);
  if (
    new Set(resolved).size !== resolved.length ||
    inputs.filter(Boolean).some((p) => resolved.includes(canonical(p)))
  )
    throw new Error("output paths must differ from inputs and each other");
}
async function styleFor(name?: string) {
  if (!name) return {};
  if (name in STYLES) return STYLES[name];
  const value = JSON.parse(await readFile(name, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("style JSON must be an object");
  return value;
}
async function enrich(world: World, o: any) {
  if (!o.ruleset && !o.localization) return world;
  await initRuleset(await readBytes(assets("wasm/sql-wasm.wasm")));
  return enrichWorld(world, {
    ruleset: o.ruleset ? await readBytes(o.ruleset) : undefined,
    localization: o.localization ? await readBytes(o.localization) : undefined,
  });
}
async function rasterReady() {
  await initRaster(
    await readBytes(assets("wasm/resvg.wasm")),
    await Promise.all(
      ["DejaVuSerif.ttf", "DejaVuSans.ttf"].map((n) =>
        readBytes(assets("fonts/" + n)),
      ),
    ),
  );
}
async function htmlAssets() {
  return {
    css: await readFile(path.join(root, "dist/viewer/viewer.css"), "utf8"),
    js: await readFile(path.join(root, "dist/viewer/viewer.js"), "utf8"),
  };
}
async function mapFile(file?: string) {
  if (!file) return null;
  if (path.extname(file).toLowerCase() === ".civ5map")
    return parseMap(await readBytes(file));
  if (path.extname(file).toLowerCase() === ".json")
    return loadMapJson(JSON.parse(await readFile(file, "utf8")));
  throw new Error("base map must be .Civ5Map or normalized/scenario .json");
}
async function turnOneFile(file: string) {
  if (path.extname(file).toLowerCase() !== ".civ5save")
    throw new Error("--turn-one-save must be a .Civ5Save");
  return extractSave(await readBytes(file), { playerNames: false });
}
const program = new Command()
  .name("civmapper")
  .description("Civilization V saves/replays to JSON, SVG, PNG, HTML and GIF")
  .exitOverride();
const fail = (error: any) => {
  if (
    error instanceof CommanderError &&
    ["commander.helpDisplayed", "commander.help", "commander.version"].includes(
      error.code,
    )
  )
    return;
  console.error("error: " + error.message);
  process.exitCode = 2;
};
function extractionOptions(c: Command) {
  return c
    .option("--profile <name>", "validated layout profile", "auto")
    .option("--no-player-names", "omit multiplayer nicknames")
    .option("--ruleset <file>")
    .option("--localization <file>")
    .option("--turn-one-save <file>");
}
function renderOptions(c: Command) {
  return c
    .option("--style <name>", "atlas, parchment, minimalist or custom JSON")
    .option(
      "--mode <mode>",
      "political, physical, army or culture",
      "political",
    )
    .option(
      "--perspective <player-id>",
      "source major empire for tourism influence",
    )
    .option("--army-icons <icons>", "domain or detailed")
    .option("--military-summary");
}
function checkOptions(o: any) {
  if (!["political", "physical", "army", "culture"].includes(o.mode))
    throw new Error("unsupported render mode");
  if (
    o.mode === "culture" &&
    (o.perspective === undefined || !/^\d+$/.test(o.perspective))
  )
    throw new Error("--mode culture requires --perspective <player-id>");
  if (o.perspective !== undefined && o.mode !== "culture")
    throw new Error("--perspective requires --mode culture");
  if ((o.armyIcons || o.militarySummary) && o.mode !== "army")
    throw new Error("--army-icons and --military-summary require --mode army");
  if (o.armyIcons && !["domain", "detailed"].includes(o.armyIcons))
    throw new Error("invalid army icons");
  if (o.profile && o.profile !== "auto" && !(o.profile in PROFILES))
    throw new Error("unknown profile " + o.profile);
}
program.command("styles").action(() => {
  for (const name of Object.keys(PRESETS).sort())
    console.log(name.padEnd(12) + " " + PRESETS[name]);
});
program
  .command("inspect")
  .argument("<save>")
  .requiredOption("-o, --output <file>")
  .option("--dump-state <file>")
  .action(async (save, o) => {
    protect([save], [o.output, o.dumpState]);
    const result = inspectSave(await readBytes(save));
    await writeFile(o.output, JSON.stringify(result.world, null, 2) + "\n");
    if (o.dumpState) await writeFile(o.dumpState, result.state);
  });
extractionOptions(
  program
    .command("extract")
    .argument("<save>")
    .requiredOption("-o, --output <file>")
    .option("--units"),
).action(async (save, o) => {
  protect([save, o.ruleset, o.localization, o.turnOneSave], [o.output]);
  if (o.profile !== "auto" && !(o.profile in PROFILES))
    throw new Error("unknown profile " + o.profile);
  let world = extractSave(await readBytes(save), {
    profile: o.profile,
    playerNames: o.playerNames,
    units: o.units,
  });
  world = await enrich(world, o);
  if (o.turnOneSave)
    world = addTurnOnePlayers(world, await turnOneFile(o.turnOneSave));
  await writeFile(o.output, JSON.stringify(world, null, 2) + "\n");
  console.error("Complete extraction written to " + o.output);
});
async function renderInput(input: string, o: any, save: boolean) {
  const defaultOutput = save && !o.output;
  o.output ??= path.join(
    "artifacts",
    path.basename(input, path.extname(input)) +
      (o.mode === "political" ? "" : "-" + o.mode) +
      ".png",
  );
  checkOptions(o);
  if (save) {
    if (path.extname(input).toLowerCase() !== ".civ5save")
      throw new Error("render-save input must end in .Civ5Save");
    if (!o.enrichment && (o.ruleset || o.localization))
      throw new Error(
        "--no-enrichment cannot be combined with database options",
      );
    if (o.enrichment)
      for (const [key, file] of [
        ["ruleset", "Civ5DebugDatabase.db"],
        ["localization", "Localization-Merged.db"],
      ]) {
        const local = path.join("artifacts/ruleset", file);
        if (!o[key] && existsSync(local)) o[key] = local;
      }
  }
  protect(
    [
      input,
      o.ruleset,
      o.localization,
      o.turnOneSave,
      o.style && !(o.style in STYLES) ? o.style : null,
    ],
    [o.output],
  );
  let world = save
    ? extractSave(await readBytes(input), {
        profile: o.profile,
        playerNames: o.playerNames,
        units: o.mode === "army",
      })
    : JSON.parse(await readFile(input, "utf8"));
  world = await enrich(world, o);
  if (o.turnOneSave)
    world = addTurnOnePlayers(world, await turnOneFile(o.turnOneSave));
  const style = await styleFor(o.style);
  if (o.armyIcons) style.armyIcons = o.armyIcons;
  if (o.militarySummary) style.showMilitarySummary = true;
  const extension = path.extname(o.output).toLowerCase();
  let result: any;
  if ([".html", ".htm"].includes(extension))
    result = renderHtml(
      world,
      await htmlAssets(),
      style,
      o.mode,
      o.perspective === undefined ? undefined : Number(o.perspective),
    );
  else {
    const svg = renderSvg(world, style, {
      mode: o.mode,
      perspective:
        o.perspective === undefined ? undefined : Number(o.perspective),
    });
    if (extension === ".svg") result = svg;
    else if (extension === ".png") {
      const scale = Number(o.scale);
      if (!Number.isFinite(scale) || scale < 0.25 || scale > 8)
        throw new Error("PNG scale must be between 0.25 and 8");
      await rasterReady();
      result = rasterize(svg, scale).png;
    } else
      throw new Error("render output must end in .svg, .png or .html/.htm");
  }
  if (defaultOutput) await mkdir(path.dirname(o.output), { recursive: true });
  await writeFile(o.output, result);
  console.error("Map written to " + o.output);
}
renderOptions(
  program
    .command("render")
    .argument("<world>")
    .requiredOption("-o, --output <file>")
    .option("--scale <n>", "PNG scale", "1")
    .option("--turn-one-save <file>"),
).action((world, o) => renderInput(world, o, false));
extractionOptions(
  renderOptions(
    program
      .command("render-save")
      .argument("<save>")
      .option("-o, --output <file>")
      .option("--scale <n>", "PNG scale", "2")
      .option("--no-enrichment"),
  ),
).action((save, o) => renderInput(save, o, true));
async function replayFile(file: string) {
  const suffix = path.extname(file).toLowerCase(),
    data = await readBytes(file);
  if (suffix === ".civ5save") return parseSaveReplay(data);
  if (suffix === ".civ5replay") return parseReplay(data);
  if (suffix === ".json") {
    const replay = JSON.parse(new TextDecoder().decode(data));
    validateReplay(replay);
    return replay;
  }
  throw new Error(
    "replay input must be .Civ5Save, .Civ5Replay or exported .json",
  );
}
program
  .command("extract-replay")
  .argument("<replay>")
  .requiredOption("-o, --output <file>")
  .action(async (file, o) => {
    protect([file], [o.output]);
    const replay = await replayFile(file);
    await writeFile(o.output, JSON.stringify(replay, null, 2) + "\n");
    console.error(
      `Exported ${replay.events.length} replay events to ${o.output}`,
    );
  });
program
  .command("render-replay")
  .requiredOption("--replay <file>")
  .option("--map <file>")
  .requiredOption("-o, --output <file>")
  .option("--maxturns <n>", "eventful turns; zero means all", "0")
  .option("--style <name>")
  .option("--captions")
  .option("--mode <mode>", "political or physical", "political")
  .option("--owner-map <file>")
  .option("--scale <n>", "GIF scale", ".5")
  .option("--duration <ms>", "frame duration", "1000")
  .option("--wrap-x")
  .option("--no-wrap-x")
  .action(async (o) => {
    if (
      process.argv.includes("--wrap-x") &&
      process.argv.includes("--no-wrap-x")
    )
      throw new Error("--wrap-x and --no-wrap-x are mutually exclusive");
    protect(
      [
        o.replay,
        o.map,
        o.ownerMap,
        o.style && !(o.style in STYLES) ? o.style : null,
      ],
      [o.output],
    );
    const ext = path.extname(o.output).toLowerCase();
    if (![".gif", ".svg"].includes(ext))
      throw new Error("replay output must be .gif or .svg");
    if (ext === ".gif") await rasterReady();
    const result = exportReplay(
      await replayFile(o.replay),
      await mapFile(o.map),
      {
        format: ext === ".svg" ? "svg" : "gif",
        style: await styleFor(o.style),
        captions: o.captions,
        mode: o.mode,
        scale: Number(o.scale),
        duration: Number(o.duration),
        maxturns: Number(o.maxturns),
        mapFilename: o.map,
        wrapX: process.argv.includes("--wrap-x")
          ? true
          : process.argv.includes("--no-wrap-x")
            ? false
            : null,
        ownerMap: o.ownerMap
          ? JSON.parse(await readFile(o.ownerMap, "utf8"))
          : null,
      },
    );
    await writeFile(o.output, result.data);
    for (const warning of result.warnings) console.error("warning: " + warning);
    console.error(
      `Rendered ${result.frames.length} eventful turns to ${o.output}`,
    );
  });
await program
  .parseAsync(process.argv.map((a) => (a === "-maxturns" ? "--maxturns" : a)))
  .catch(fail);
