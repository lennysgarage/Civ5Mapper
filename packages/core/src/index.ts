import * as p from "./compat.js";
import * as saves from "./save.js";
import * as extraction from "./extract.js";
import * as maps from "./mapio.js";
import * as replays from "./replay.js";
import * as replayRender from "./replay_render.js";
import * as renderer from "./render.js";
import * as military from "./military.js";
import { validateCulture, type CultureState } from "./culture.js";
import { culturePerspective, cultureSvg } from "./culture_present.js";
export {
  cultureSources,
  culturePair,
  cultureTerritory,
  cultureColor,
} from "./culture_present.js";
export type { CultureState, CulturePlayer } from "./culture.js";
export { ParseError } from "./compat.js";
export { Reader } from "./binary.js";
export const MAX_INPUT = 64 * 1024 * 1024;
export const PROFILES = p.unwrap(extraction.PROFILES);
export const DEFAULT_STYLE = p.unwrap(renderer.DEFAULT_STYLE);
export const PALETTE = p.unwrap(renderer.PALETTE);
export const ROLE_LABELS = p.unwrap(military.ROLE_LABELS);
export interface Civilization {
  id: number;
  kind: string;
  key?: string;
  name?: string;
  playerName?: string | null;
  [key: string]: any;
}
export interface World {
  schemaVersion: "0.1";
  source: Record<string, any>;
  extraction: {
    status: string;
    fields: Record<string, string>;
    warnings: string[];
  };
  game: {
    width: number;
    height: number;
    turn?: number;
    wrapX: boolean;
    wrapY: boolean;
    coordinates: string;
    [key: string]: any;
  };
  civilizations: Civilization[];
  tiles: Record<string, any>[];
  cities: Record<string, any>[];
  units?: Record<string, any>[];
  culture?: CultureState;
  inspection?: Record<string, any>;
}
export interface ExtractOptions {
  profile?: string;
  playerNames?: boolean;
  units?: boolean;
}
export type Style = Record<string, any>;
export function inspectSave(data: Uint8Array, diagnostics = true) {
  const [world, state] = saves.inspect_bytes(
    data,
    undefined,
    false,
    diagnostics,
  );
  return { world: p.unwrap(world), state };
}
export function extractSave(
  data: Uint8Array,
  options: ExtractOptions = {},
): World {
  return p.unwrap(
    extraction.extract_bytes(
      data,
      options.profile ?? "auto",
      options.playerNames ?? true,
      options.units ?? false,
    ),
  );
}
export function validateWorld(world: World) {
  renderer.validate_world(p.wrapJson(world));
  validateCulture(world);
}
export function renderSvg(
  world: World,
  style: Style | null = null,
  options: {
    mode?: string;
    interactive?: boolean;
    perspective?: number | null;
    captions?: string[] | null;
  } = {},
) {
  const culture = options.mode === "culture";
  const perspective = culture ? (options.perspective ?? null) : undefined;
  if (culture) culturePerspective(world, perspective ?? undefined);
  const svg = renderer.render_svg(
    p.wrapJson(world),
    culture
      ? p.wrapJson({ ...style, shadeAlliedCityStates: false })
      : style
        ? p.wrapJson(style)
        : null,
    options.captions ?? null,
    culture ? "political" : (options.mode ?? "political"),
    options.interactive ?? false,
  );
  return culture ? cultureSvg(svg, world, perspective ?? null) : svg;
}
export function armyGroups(world: World) {
  return [...renderer.army_groups(p.wrapJson(world))].map(([key, units]) => ({
    owner: key[0],
    x: key[1],
    y: key[2],
    units: p.unwrap(units),
  }));
}
export function militarySummary(world: World) {
  const raw = p.wrapJson(world);
  return p.unwrap(
    military.military_summary(
      p.get(raw, "civilizations"),
      renderer.army_groups(raw),
    ),
  );
}
export function empireLabel(civ: Civilization, mode = "player") {
  return renderer.empire_label(p.wrapJson(civ), mode);
}
export function parseMap(data: Uint8Array): World {
  return p.unwrap(maps.parse_map(data));
}
export function loadMapJson(data: any): World {
  if (data.MapData) return p.unwrap(maps.upstream_map(p.wrapJson(data)));
  validateWorld(data);
  return data;
}
export function parseReplay(data: Uint8Array): any {
  return p.unwrap(replays.parse_replay(data));
}
export function parseSaveReplay(data: Uint8Array): any {
  return p.unwrap(replays.parse_save_replay(data));
}
export function validateReplay(replay: any) {
  replayRender.validate_replay(p.wrapJson(replay));
}
export interface ReplayOptions {
  maxturns?: number;
  mapFilename?: string | null;
  wrapX?: boolean | null;
  ownerMap?: Record<string, number> | null;
}
export function* replaySteps(
  replay: any,
  base: World | null = null,
  options: ReplayOptions = {},
): Generator<{ world: World; notes: any[] }> {
  for (const [world, notes] of replayRender.replay_steps(
    p.wrapJson(replay),
    base ? p.wrapJson(base) : null,
    options.maxturns ?? 0,
    options.mapFilename ?? null,
    options.wrapX ?? null,
    options.ownerMap ? p.wrapJson(options.ownerMap) : null,
  ))
    yield { world: p.unwrap(world), notes: p.unwrap(notes) };
}
export function captionText(
  notes: any[],
  world: World,
  style: Style | null = null,
) {
  return replayRender.caption_text(
    p.wrapJson(notes),
    p.wrapJson(world),
    style ? p.wrapJson(style) : null,
  );
}
