import { ParseError } from "./compat.js";
import { Reader } from "./binary.js";
import {
  validateReligion,
  religiousMajority,
  type CityReligion,
} from "./religion.js";
import type { World } from "./index.js";
const fail = (message: string): never => {
  throw new ParseError(message);
};
/** Decode only at a structurally established offset. No scanning or guesses. */
export function readCityReligionBlock(
  state: Uint8Array,
  offset: number,
  population: number,
) {
  const r = new Reader(state, offset),
    version = r.unpack("I");
  if (![1, 2, 3].includes(version)) fail("unsupported city religion version");
  if (version >= 2 && r.unpack("B") > 1)
    fail("invalid paid adoption bonus flag");
  const pressureModifier = version >= 3 ? r.unpack("i") : 0;
  const n = r.count(256),
    records: CityReligion[] = [];
  for (let i = 0; i < n; i++) {
    const entryVersion = r.unpack("I");
    if (![1, 2].includes(entryVersion))
      fail("unsupported religion-in-city version");
    const religionId = r.unpack("i"),
      holy = r.unpack("B"),
      followers = r.unpack("i"),
      pressure = r.unpack("i");
    if (holy > 1) fail("invalid holy city flag");
    records.push({
      religionId,
      holyCity: holy === 1,
      followers,
      pressure,
      ...(entryVersion === 2
        ? { tradeRoutesApplyingPressure: r.unpack("i") }
        : {}),
    });
  }
  validateReligion({
    cities: [{ religionKnown: true, religions: records, population }],
    tiles: [],
  } as any);
  return {
    records,
    majorityReligionId: religiousMajority(records),
    pressureModifier,
    evidence: { offset, endOffset: r.pos, version },
  };
}

function boolean(r: Reader) {
  const value = r.unpack("B");
  if (value > 1) fail("invalid city-tail boolean");
  return value;
}
function versionOne(r: Reader) {
  if (r.unpack("I") !== 1) fail("unsupported city-tail subobject version");
}
function hashedArray(r: Reader, size: number, limit = 4096) {
  const count = r.count(limit),
    hashes: number[] = [];
  for (let i = 0; i < count; i++) {
    const hash = r.unpack("I");
    hashes.push(hash);
    if (hash !== 0) {
      if (size === 1) boolean(r);
      else r.take(size);
    }
  }
  return hashes;
}
function sameHashes(a: number[], b: number[]) {
  if (a.length !== b.length || a.some((h, i) => h !== b[i]))
    fail("city-tail paired hash arrays disagree");
}
function citizens(r: Reader, population: number) {
  versionOne(r);
  boolean(r);
  boolean(r);
  const values = [r.unpack("i"), r.unpack("i"), r.unpack("i")];
  if (values.some((v) => v < 0 || v > population))
    fail("invalid citizen assignment count");
  const focus = r.unpack("i");
  if (focus < -1 || focus > 32) fail("invalid citizen focus");
  boolean(r);
  // SDK fixed arrays, not counted vectors. These profiles support 37 city plots.
  for (let i = 0; i < 74; i++) boolean(r);
  const defaults = [r.unpack("i"), r.unpack("i")];
  if (defaults.some((v) => v < 0 || v > population))
    fail("invalid default specialist count");
  const specialist = hashedArray(r, 4, 128);
  sameHashes(specialist, hashedArray(r, 4, 128));
  const buildings = hashedArray(r, 4);
  sameHashes(buildings, hashedArray(r, 4));
  sameHashes(specialist, hashedArray(r, 4, 128));
}
function followingObjects(r: Reader, yields: number) {
  versionOne(r); // Emphases: counts, fixed yield array, hashed booleans.
  for (let i = 0; i < 2 + yields; i++) {
    const n = r.unpack("i");
    if (n < 0 || n > 256) fail("invalid emphasis count");
  }
  hashedArray(r, 1, 128);
  if (r.unpack("I") !== 0) fail("unsupported city espionage version");
  let dimension: number | undefined;
  for (let i = 0; i < 9; i++) {
    const n = r.count(64);
    if (n < 1 || (dimension !== undefined && n !== dimension))
      fail("city espionage dimensions disagree");
    dimension = n;
    r.take(n * 4);
  }
  const extraHitPoints = r.unpack("i");
  if (extraHitPoints < 0 || extraHitPoints > 100000)
    fail("invalid city extra hit points");
}
/** Duplicate serialized city name anchors a known strategy -> production AI ->
 * citizens -> religion -> emphases -> espionage chain. The project AI vector
 * has no saved count, so require exactly one complete bounded structural match;
 * its inferred dimension must also agree across cities before exposing data. */
export function locateCityReligion(
  state: Uint8Array,
  city: any,
  limit: number,
  yields: number,
) {
  state = state.subarray(0, Math.min(limit, state.length));
  const text = new TextEncoder().encode(city.name),
    marker = new Uint8Array(4 + text.length);
  new DataView(marker.buffer).setUint32(0, text.length, true);
  marker.set(text, 4);
  const lower = city.evidence.nameEndOffset,
    upper = Math.min(limit, state.length, lower + 1_000_000);
  const matches: any[] = [];
  for (let pos = lower; pos < upper;) {
    pos = state.indexOf(marker[0], pos);
    if (pos < 0 || pos + marker.length >= upper) break;
    const anchor = pos++;
    if (anchor < 14) continue;
    if (marker.some((v, i) => state[anchor + i] !== v)) continue;
    try {
      // City tail immediately before the repeated name: expansion turn,
      // happiness, and two route connection flags.
      const before = new Reader(state, anchor - 14);
      const expanded = before.unpack("i");
      const happiness = [before.unpack("i"), before.unpack("i")];
      if (expanded < -1 || happiness.some((v) => Math.abs(v) > 100000))
        continue;
      boolean(before);
      boolean(before);
      const r = new Reader(state, anchor + marker.length);
      boolean(r);
      versionOne(r);
      const flavors = r.count(128);
      if (flavors < 1) continue;
      r.take(flavors * 4);
      const strategies = hashedArray(r, 1, 256);
      sameHashes(strategies, hashedArray(r, 4, 256));
      for (let i = 0; i < 2; i++) {
        const specialization = r.unpack("i");
        if (specialization < -1 || specialization > 128)
          fail("invalid city specialization");
      }
      for (let i = 0; i < 2; i++) {
        versionOne(r);
        hashedArray(r, 4);
      }
      versionOne(r); // Uncounted project AI weights begin here.
      const projectsStart = r.pos;
      for (let projectCount = 0; projectCount <= 256; projectCount++) {
        try {
          const tail = new Reader(state, projectsStart + projectCount * 4);
          versionOne(tail);
          const processes = tail.count(128);
          if (processes < 1) continue;
          // Process AI always writes a weight, including an unknown hash.
          tail.take(processes * 8);
          citizens(tail, city.population);
          const decoded = readCityReligionBlock(
            state,
            tail.pos,
            city.population,
          );
          if (
            decoded.records.length &&
            decoded.records.reduce((n, r) => n + r.followers, 0) !==
              city.population
          )
            continue;
          tail.pos = decoded.evidence.endOffset;
          followingObjects(tail, yields);
          if (tail.pos > upper) continue;
          matches.push({
            ...decoded,
            evidence: {
              ...decoded.evidence,
              nameAnchor: anchor,
              projectCount,
              tailEndOffset: tail.pos,
              locator: "city-tail-structural-v1",
            },
          });
        } catch (error) {
          if (!(error instanceof ParseError)) throw error;
        }
      }
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
    }
  }
  if (matches.length !== 1)
    fail(
      matches.length
        ? "ambiguous city religion structural chain"
        : "city religion structural chain unavailable",
    );
  return matches[0];
}
export function extractCityReligions(
  world: World,
  state: Uint8Array,
  yields: number,
) {
  const cities = [...world.cities].sort(
    (a, b) => a.evidence.offset - b.evidence.offset,
  );
  const decoded = new Map<any, any>(),
    dimensions = new Set<number>();
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    try {
      const status = locateCityReligion(
        state,
        city,
        cities[i + 1]?.evidence.offset ?? state.length,
        yields,
      );
      decoded.set(city, status);
      dimensions.add(status.evidence.projectCount);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      city.religionEvidence = { status: "unavailable", reason: error.message };
    }
  }
  if (dimensions.size > 1) {
    decoded.clear();
    world.extraction.warnings.push(
      "City religion project-AI dimensions disagree; religion records remain unknown.",
    );
  }
  for (const city of world.cities) {
    const status = decoded.get(city);
    city.religionKnown = Boolean(status);
    city.religions = status?.records ?? null;
    city.majorityReligionId = status?.majorityReligionId ?? null;
    if (status) city.religionEvidence = status.evidence;
  }
  world.extraction.fields.cityReligion =
    decoded.size === cities.length && cities.length > 0
      ? "extracted"
      : decoded.size
        ? "partial"
        : "unavailable";
  if (decoded.size < cities.length)
    world.extraction.warnings.push(
      `${cities.length - decoded.size} city religion structures could not be uniquely validated; those cities remain unknown.`,
    );
  world.extraction.fields.religionNames = "unavailable";
  return world;
}

/** Optional names/founders use a complete game-religion container, cross-checked
 * against independently decoded holy-city coordinates. Never name by ID alone. */
export function extractReligionCatalog(world: World, state: Uint8Array) {
  world.extraction.fields.religionCatalog = "unavailable";
  const plotStart = world.inspection?.plots?.offset;
  if (!Number.isInteger(plotStart)) return world;
  const prefix = state.subarray(0, plotStart),
    matches: any[] = [];
  const holy = new Map<number, any>();
  for (const city of world.cities)
    if (city.religionKnown === true)
      for (const r of city.religions!)
        if (r.holyCity && r.religionId > 0) holy.set(r.religionId, city);
  if (!holy.size) return world;
  const major = new Set(
    world.civilizations.filter((c) => c.kind === "major").map((c) => c.id),
  );
  // SDK belief scalar count and the independently observed local DLL count.
  // Values in the additional scalar slots are skipped, never named.
  for (const beliefScalars of [26, 34]) {
    for (
      let pos = prefix.indexOf(4);
      pos >= 0;
      pos = prefix.indexOf(4, pos + 1)
    ) {
      try {
        const r = new Reader(prefix, pos);
        if (r.unpack("I") !== 4) continue;
        const faith = r.unpack("i"),
          n = r.count(64);
        if (faith < 0 || faith > 100000 || n < 1) continue;
        const catalog: any[] = [],
          identities = new Set<string>();
        let crossChecks = 0;
        for (let i = 0; i < n; i++) {
          if (r.unpack("I") !== 4) fail("unsupported global religion version");
          const id = r.unpack("i"),
            founder = r.unpack("i"),
            x = r.unpack("i"),
            y = r.unpack("i"),
            founded = r.unpack("i");
          if (
            id < 0 ||
            !major.has(founder) ||
            founded < 0 ||
            founded > world.game.turn ||
            x < -1 ||
            x >= world.game.width ||
            y < -1 ||
            y >= world.game.height ||
            (x === -1) !== (y === -1)
          )
            fail("invalid global religion identity");
          const pantheon = boolean(r);
          boolean(r);
          if (Boolean(pantheon) !== (id === 0))
            fail("global religion pantheon mismatch");
          const identity = `${id}:${id === 0 ? founder : "founded"}`;
          if (identities.has(identity))
            fail("duplicate global religion identity");
          identities.add(identity);
          const bytes = r.take(128),
            terminator = bytes.indexOf(0);
          if (terminator < 0 || bytes.subarray(terminator).some((b) => b !== 0))
            fail("invalid global religion custom name padding");
          const customName = new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, terminator),
          );
          if (/[\u0000-\u001f\u007f]/.test(customName))
            fail("invalid global religion custom name");
          const beliefs = r.unpack("I");
          if (![1, 2].includes(beliefs))
            fail("unsupported religion beliefs version");
          r.take((beliefs === 2 ? beliefScalars : beliefScalars - 1) * 4);
          const beliefCount = r.count(64);
          r.take(beliefCount * 4);
          hashedArray(r, 4);
          const city = holy.get(id);
          if (city) {
            if (city.x !== x || city.y !== y)
              fail("global religion holy city mismatch");
            crossChecks++;
          }
          if (id > 0)
            catalog.push({
              id,
              founder,
              holyCity: x === -1 ? null : { x, y },
              customNameKnown: true,
              customName: customName || null,
              ...(customName
                ? { name: customName, nameSource: "saved-custom-name" }
                : {}),
              evidence: {
                containerOffset: pos,
                beliefScalars,
                locator: "game-religions-structural-v1",
              },
            });
        }
        if (crossChecks !== holy.size) continue;
        matches.push(catalog);
      } catch (error) {
        if (!(error instanceof ParseError) && !(error instanceof TypeError))
          throw error;
      }
    }
  }
  if (matches.length === 1) {
    world.religions = matches[0];
    world.extraction.fields.religionCatalog = "extracted";
    world.extraction.fields.religionNames = world.religions!.every(
      (r) => r.name,
    )
      ? "extracted"
      : "partial";
  } else {
    world.extraction.fields.religionCatalog = "unavailable";
    world.extraction.warnings.push(
      "Saved religion names and founders remain unknown: no unique validated global religion container.",
    );
  }
  return world;
}
