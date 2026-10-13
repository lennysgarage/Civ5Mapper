import {
  extractSave,
  parseReplay,
  parseSaveReplay,
  parseMap,
  loadMapJson,
  validateWorld,
  replaySteps,
  captionText,
  MAX_INPUT,
  type World,
} from "../../core/src/index.js";
import { enrichBrowserWorld } from "../../core/src/browser_metadata.js";
import { initRaster, exportReplay } from "../../core/src/raster.js";
import { STYLES } from "../../core/src/styles.js";
let world: World | null = null,
  replay: any = null,
  base: World | null = null,
  rawWorld: World | null = null,
  rawBase: World | null = null,
  options: any = {};
const fileBytes = (file: any) =>
  file?.bytes ? new Uint8Array(file.bytes) : undefined;
function checked(file: any) {
  const bytes = fileBytes(file);
  if (!bytes || !bytes.length || bytes.length > MAX_INPUT)
    throw new Error("input size limit exceeded");
  return bytes;
}
const json = (file: any) => JSON.parse(new TextDecoder().decode(checked(file)));
const snapshot = () => ({ world, replay, base, rawWorld, rawBase, options });
function send(id: number, value: any) {
  self.postMessage({ id, ...value });
}
self.onmessage = async (event) => {
  const { id, action, inputs } = event.data;
  try {
    if (action === "restore") {
      world = inputs.world;
      replay = inputs.replay;
      base = inputs.base;
      rawWorld = inputs.rawWorld;
      rawBase = inputs.rawBase;
      options = inputs.options;
      send(id, { restored: true });
    } else if (action === "load-save") {
      send(id, { progress: "Decoding save…" });
      const bytes = checked(inputs.file);
      let w: World;
      if (inputs.file.name.toLowerCase().endsWith(".json")) {
        w = json(inputs.file);
        validateWorld(w);
      } else {
        try {
          w = extractSave(bytes, {
            playerNames: inputs.playerNames,
            units: true,
          });
        } catch (e) {
          w = extractSave(bytes, { playerNames: inputs.playerNames });
          w.extraction.warnings.push(
            "Army view unavailable: " + (e as Error).message,
          );
        }
      }
      send(id, { progress: "Resolving terrain and military metadata…" });
      const original = w;
      w = await enrichBrowserWorld(w, inputs);
      rawWorld = original;
      rawBase = null;
      world = w;
      replay = null;
      base = null;
      options = {};
      send(id, {
        world,
        session: snapshot(),
        resetView: true,
      });
    } else if (action === "load-replay") {
      const file = inputs.file,
        bytes = checked(file);
      send(id, { progress: "Decoding replay…" });
      const r = file.name.toLowerCase().endsWith(".civ5save")
        ? parseSaveReplay(bytes)
        : file.name.toLowerCase().endsWith(".json")
          ? json(file)
          : parseReplay(bytes);
      let b: World | null = null;
      if (inputs.base)
        b = inputs.base.name.toLowerCase().endsWith(".civ5map")
          ? parseMap(checked(inputs.base))
          : loadMapJson(json(inputs.base));
      else if (file.name.toLowerCase().endsWith(".civ5save")) {
        try {
          b = extractSave(bytes, { playerNames: inputs.playerNames });
        } catch (error) {
          r.extraction.warnings.push(
            "Current-save geography metadata unavailable: " +
              (error as Error).message,
          );
        }
      }
      const original = b;
      if (b) b = await enrichBrowserWorld(b, inputs);
      const o = {
        maxturns: inputs.maxturns,
        mapFilename: inputs.base?.name ?? null,
        wrapX: inputs.wrapX,
        ownerMap: inputs.ownerMap ? json(inputs.ownerMap) : null,
      };
      const turns: number[] = [];
      let first: any = null;
      for (const step of replaySteps(r, b, o)) {
        if (!first) first = step;
        turns.push(step.world.game.turn);
      }
      if (!first) throw new Error("Replay has no frames");
      replay = r;
      base = b;
      rawBase = original;
      rawWorld = null;
      options = o;
      world = first.world;
      send(id, {
        world,
        notes: first.notes,
        replay,
        turns,
        session: snapshot(),
        resetView: true,
      });
    } else if (action === "update-metadata") {
      send(id, {
        progress: "Updating city names, terrain and military metadata…",
      });
      if (replay && rawBase) {
        const enriched = await enrichBrowserWorld(rawBase, inputs);
        let step: any;
        for (const candidate of replaySteps(replay, enriched, options)) {
          if (candidate.world.game.turn === world?.game.turn) {
            step = candidate;
            break;
          }
        }
        if (!step) throw new Error("Current replay frame is unavailable");
        base = enriched;
        world = step.world;
        send(id, { world, notes: step.notes, session: snapshot() });
      } else if (rawWorld) {
        const enriched = await enrichBrowserWorld(rawWorld, inputs);
        world = enriched;
        send(id, { world, session: snapshot() });
      } else {
        send(id, { world, notes: [], session: snapshot() });
      }
    } else if (action === "replay-frame") {
      let step: any,
        index = 0;
      for (const s of replaySteps(replay, base, options)) {
        if (index++ === inputs.index) {
          step = s;
          break;
        }
      }
      if (!step) throw new Error("Replay frame is outside the selected range");
      world = step.world;
      send(id, { world, notes: step.notes });
    } else if (action === "export-gif") {
      if (!replay) throw new Error("Load a replay first");
      send(id, { progress: "Preparing GIF renderer…" });
      const bytes = async (name: string) =>
        new Uint8Array(
          await (await fetch(new URL(name, inputs.assetBase))).arrayBuffer(),
        );
      await initRaster(
        await bytes("wasm/resvg.wasm"),
        await Promise.all(
          ["DejaVuSerif.ttf", "DejaVuSans.ttf"].map((n) => bytes("fonts/" + n)),
        ),
      );
      const result = exportReplay(replay, base, {
        ...options,
        style: STYLES[inputs.style],
        mode: inputs.mode,
        captions: inputs.captions,
        scale: inputs.scale,
        duration: inputs.duration,
        format: "gif",
        progress: (n) => send(id, { progress: `Rendering replay frame ${n}…` }),
      });
      send(id, { download: result.data.buffer });
    } else throw new Error("Unknown worker action");
  } catch (error) {
    send(id, { error: (error as Error).message });
  }
};
