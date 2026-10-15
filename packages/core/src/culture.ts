import { Reader } from "./binary.js";
import { ParseError } from "./compat.js";
import type { World } from "./index.js";

export const CULTURE_LEVELS = [
  "exotic",
  "familiar",
  "popular",
  "influential",
  "dominant",
] as const;
export type CultureLevel = "unknown" | (typeof CULTURE_LEVELS)[number];
export interface CulturePlayer {
  playerId: number;
  alive: boolean;
  lifetimeCulture: number | null;
  storedCulture?: number | null;
  accumulatedInfluence: Record<string, number | null>;
  contact?: Record<string, boolean | null>;
  evidence?: {
    offset: number;
    endOffset: number;
    boundaryEndOffset: number;
    prefixOffset: number;
    storedScale: number;
    version: number;
  };
}
export interface CultureState {
  turn: number;
  players: CulturePlayer[];
  thresholds?: {
    values: number[];
    source: "ruleset-database";
    databaseSha256: string;
  };
}
const integer = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
const total = (n: unknown) => integer(n) && (n as number) <= 2147483647;
export function validateCulture(world: World) {
  const culture = world.culture;
  if (!culture) return;
  if (
    !integer(culture.turn) ||
    culture.turn !== world.game.turn ||
    !Array.isArray(culture.players)
  )
    throw new ParseError("culture snapshot must match the current world turn");
  const ids = new Set<number>();
  for (const p of culture.players) {
    if (
      !integer(p.playerId) ||
      ids.has(p.playerId) ||
      !world.civilizations.some(
        (c) => c.id === p.playerId && c.kind === "major",
      ) ||
      typeof p.alive !== "boolean"
    )
      throw new ParseError("invalid culture player identity");
    ids.add(p.playerId);
    if (p.lifetimeCulture !== null && !total(p.lifetimeCulture))
      throw new ParseError("invalid lifetime culture");
    if (p.storedCulture != null && !total(p.storedCulture))
      throw new ParseError("invalid stored culture");
    if (
      !p.accumulatedInfluence ||
      typeof p.accumulatedInfluence !== "object" ||
      Array.isArray(p.accumulatedInfluence)
    )
      throw new ParseError("invalid tourism influence matrix");
    for (const [target, amount] of Object.entries(p.accumulatedInfluence)) {
      if (
        !/^\d+$/.test(target) ||
        !world.civilizations.some(
          (c) => c.id === Number(target) && c.kind === "major",
        ) ||
        (amount !== null && !total(amount))
      )
        throw new ParseError("invalid accumulated tourism influence");
    }
    if (
      p.contact !== undefined &&
      (!p.contact || typeof p.contact !== "object" || Array.isArray(p.contact))
    )
      throw new ParseError("invalid culture contact map");
    for (const [target, contact] of Object.entries(p.contact ?? {})) {
      if (
        !world.civilizations.some(
          (c) => c.id === Number(target) && c.kind === "major",
        ) ||
        (contact !== null && typeof contact !== "boolean")
      )
        throw new ParseError("invalid culture contact state");
    }
  }
  if (culture.thresholds) {
    const t = culture.thresholds;
    if (
      t.source !== "ruleset-database" ||
      !/^[a-f0-9]{64}$/.test(t.databaseSha256) ||
      !Array.isArray(t.values) ||
      t.values.length !== 5 ||
      t.values.some((v, i) => !integer(v) || (i > 0 && v <= t.values[i - 1]))
    )
      throw new ParseError("invalid culture influence thresholds");
  }
}
function bool(r: Reader) {
  const n = r.unpack("B");
  if (n > 1) throw new ParseError("invalid culture boolean");
  return Boolean(n);
}
function bounded(n: number, lo: number, hi: number, field: string) {
  if (n < lo || n > hi) throw new ParseError(`invalid culture ${field}: ${n}`);
  return n;
}
/** Full version-6 culture plus following notifications/treasury boundary.
 * Source-derived field order; byte offsets are discovered inside an existing
 * validated player interval, never chosen from a global integer signature.
 */
export function readCultureRecord(
  state: Uint8Array,
  offset: number,
  limit: number,
  owner: number,
  width: number,
  height: number,
  turn: number,
) {
  const r = new Reader(state.subarray(0, limit), offset);
  if (r.unpack("I") !== 6)
    throw new ParseError("unsupported player culture version");
  for (let i = 0, n = r.count(width * height); i < n; i++) {
    bounded(r.unpack("i"), 0, width - 1, "dig x");
    bounded(r.unpack("i"), 0, height - 1, "dig y");
  }
  const lastLifetime = bounded(
    r.unpack("i"),
    0,
    2147483647,
    "previous lifetime culture",
  );
  if (r.count(22) !== 22)
    throw new ParseError("culture major-slot count mismatch");
  const current: number[] = [],
    previous: number[] = [];
  for (let i = 0; i < 22; i++) {
    current.push(bounded(r.unpack("i"), 0, 2147483647, "influence"));
    previous.push(bounded(r.unpack("i"), 0, 2147483647, "previous influence"));
  }
  if (current[owner] !== 0 || previous[owner] !== 0)
    throw new ParseError("nonzero culture self influence");
  bool(r);
  bool(r);
  bounded(r.unpack("i"), -1, 3, "opinion");
  bounded(r.unpack("i"), -1, 1000, "ideology");
  bounded(r.unpack("i"), 0, 1000000, "unhappiness");
  r.string();
  r.string();
  bounded(r.unpack("i"), -1, 21, "opinion source");
  bounded(r.unpack("i"), -1, turn, "ideology switch turn");
  for (let i = 0; i < 4; i++)
    bounded(r.unpack("i"), -1, 1000000, "great work reference");
  const endOffset = r.pos;
  if (bool(r)) {
    if (r.unpack("I") !== 2 || r.unpack("i") !== owner)
      throw new ParseError("culture notification owner/version mismatch");
    bounded(r.unpack("i"), 0, 2147483647, "notification lookup");
    bounded(r.unpack("i"), 0, 99, "notification begin");
    bounded(r.unpack("i"), 0, 99, "notification end");
    for (let i = 0; i < 100; i++) {
      const type = r.unpack("I");
      r.string();
      r.string();
      r.take(16);
      bounded(r.unpack("i"), -1, turn, "notification turn");
      bounded(r.unpack("i"), -1, 2147483647, "notification index");
      bool(r);
      const recipient = r.unpack("i");
      // Empty ring slots contain uninitialized payload fields in real saves.
      // Their recipient is not a player reference; active notifications are.
      if (type !== 0xffffffff)
        bounded(recipient, -1, 63, "notification player");
    }
  }
  if (r.unpack("I") !== 1)
    throw new ParseError("missing culture treasury boundary");
  r.take(9 * 4);
  for (let i = 0; i < 2; i++) r.take(r.count(turn + 1000) * 4);
  bounded(r.unpack("i"), 0, 2147483647, "lifetime gold");
  return {
    current,
    previous,
    lastLifetime,
    endOffset,
    boundaryEndOffset: r.pos,
  };
}
/** Optional empirical six- and seven-yield support, validated on copied saves.
 * This layout stores culture in hundredths, while influence and the culture
 * object's prior lifetime value use whole units (matched DLL getters).
 */
export function extractCulture(world: World, state: Uint8Array) {
  const fields = world.extraction.fields;
  fields.tourismInfluence =
    fields.cultureLifetime =
    fields.cultureContact =
    fields.cultureThresholds =
      "unavailable";
  const prefixBytes = {
    "bnw-six-yield": 908,
    "observed-seven-yield": 1050,
    "observed-eight-yield": 1046,
  }[world.inspection?.profile];
  if (!prefixBytes) {
    world.extraction.warnings.push(
      "Culture view unavailable: this player culture layout and units have not been validated.",
    );
    return;
  }
  const anchors = world.inspection?.playerIdentities;
  if (!anchors) return;
  const players: CulturePlayer[] = [];
  for (const civ of world.civilizations.filter(
    (c) => c.kind === "major" && c.id < 22,
  )) {
    const evidence = civ.capitalEvidence;
    if (!civ.capitalKnown || !evidence) continue;
    const alive = evidence.playerAlive === true;
    if (!alive) {
      players.push({
        playerId: civ.id,
        alive: false,
        lifetimeCulture: null,
        accumulatedInfluence: {},
      });
      continue;
    }
    const prefix = evidence.playerPrefixOffset;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix + 44 > state.length)
      continue;
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    const storedRaw = view.getInt32(prefix + 36, true),
      lifetimeRaw = view.getInt32(prefix + 40, true);
    const player: CulturePlayer = {
      playerId: civ.id,
      alive,
      lifetimeCulture: null,
      accumulatedInfluence: {},
    };
    players.push(player);
    if (
      storedRaw < 0 ||
      lifetimeRaw < storedRaw ||
      view.getInt32(prefix, true) !==
        (world.inspection?.profile === "observed-eight-yield" ? 17 : 16)
    )
      continue;
    const lifetime = Math.floor(lifetimeRaw / 100);
    const anchor = anchors.find((a) => a.id === civ.id);
    const next = [...anchors]
      .filter((a) => a.offset > anchor?.offset)
      .sort((a, b) => a.offset - b.offset)[0];
    if (!anchor || !next || !Number.isInteger(anchor.endOffset)) continue;
    const lo = anchor.endOffset;
    const hi = Math.min(
      next.offset - prefixBytes,
      ...world.cities
        .filter((c) => c.owner === civ.id && c.evidence?.offset != null)
        .map((c) => c.evidence.offset),
    );
    if (!Number.isInteger(hi) || lo < 0 || hi > state.length || lo >= hi)
      continue;
    const candidates: {
      offset: number;
      value: ReturnType<typeof readCultureRecord>;
    }[] = [];
    for (let offset = lo; offset + 200 < hi; offset++) {
      if (state[offset] !== 6 || view.getUint32(offset, true) !== 6) continue;
      try {
        const value = readCultureRecord(
          state,
          offset,
          hi,
          civ.id,
          world.game.width,
          world.game.height,
          world.game.turn!,
        );
        if (value.lastLifetime > lifetime) continue;
        candidates.push({ offset, value });
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
      }
    }
    if (candidates.length !== 1) {
      world.extraction.warnings.push(
        `Player ${civ.id} culture unknown: ${candidates.length} validated records.`,
      );
      continue;
    }
    const { offset, value } = candidates[0];
    player.lifetimeCulture = lifetime;
    player.storedCulture = Math.floor(storedRaw / 100);
    for (const target of world.civilizations.filter(
      (c) => c.kind === "major" && c.id < 22,
    ))
      player.accumulatedInfluence[target.id] = value.current[target.id];
    player.evidence = {
      offset,
      endOffset: value.endOffset,
      boundaryEndOffset: value.boundaryEndOffset,
      prefixOffset: prefix,
      storedScale: 100,
      version: 6,
    };
  }
  world.culture = { turn: world.game.turn!, players };
  const active = players.filter((p) => p.alive);
  const known = active.filter((p) => p.lifetimeCulture !== null).length;
  fields.tourismInfluence = fields.cultureLifetime =
    known === active.length && known > 0
      ? "extracted"
      : known
        ? "partial"
        : "unavailable";
  validateCulture(world);
}
