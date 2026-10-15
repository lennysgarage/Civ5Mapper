import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync, deflateSync } from "node:zlib";
import {
  PROFILES,
  Reader,
  inspectSave,
  extractSave,
} from "../dist/core/src/index.js";
import {
  read_plot,
  read_plots,
  read_city_candidate,
  read_cities,
} from "../dist/core/src/extract.js";
import * as p from "../dist/core/src/compat.js";
import initSqlJs from "sql.js";
import { enrichBrowserWorld } from "../dist/core/src/browser_metadata.js";
import { read_unit, UNIT_PROFILES } from "../dist/core/src/units.js";
import { read_capital, PLAYER_PROFILES } from "../dist/core/src/capitals.js";
import { player_anchors, read_minor_ai } from "../dist/core/src/diplomacy.js";

const fixtures = JSON.parse(
  gunzipSync(fs.readFileSync("tests-ts/fixtures/python-parity.json.gz")),
);
const fixture = (name) => fixtures.find((f) => f.function === name && !f.error);
const bytes = (value) => Buffer.from(value.$bytes, "base64");
const integer = (value) => {
  const result = Buffer.alloc(4);
  result.writeInt32LE(value);
  return result;
};
const profile = p.wrapJson(PROFILES["observed-eight-yield"]);
function decode(value) {
  if (value?.$bytes) return bytes(value);
  if (value?.$dict)
    return p.dict(value.$dict.map(([key, value]) => [key, decode(value)]));
  if (Array.isArray(value)) return value.map(decode);
  return value;
}

test("v17 player identities require all 64 ordered slots and 13 eight-yield vectors", () => {
  const blocks = Array.from({ length: 64 }, (_, id) => {
    const block = Buffer.alloc(36 + 13 * 36);
    block[1] = 1;
    block.writeInt32LE(-1, 18);
    block.writeInt32LE(id, 28);
    block.writeInt32LE(id, 32);
    for (let i = 0; i < 13; i++) block.writeUInt32LE(8, 36 + i * 36);
    return block;
  });
  const state = Buffer.concat(blocks);
  const anchors = p.unwrap(player_anchors(state, 0, 8, []));
  assert.deepEqual(
    anchors.map((a) => a.id),
    Array.from({ length: 64 }, (_, i) => i),
  );
  assert.equal(anchors[0].offset, 0);
  assert.equal(anchors[0].endOffset, blocks[0].length);
  state.writeInt32LE(0, blocks[0].length + 28);
  assert.throws(
    () => player_anchors(state, 0, 8, []),
    /unique ordered player identity/,
  );
});

test("v17 capital references identify the current owned city and reject a broken join", () => {
  const [old, anchor, oldProfile, world] = decode(fixture("read_capital").args);
  const oldIdentity = anchor.get("offset");
  const oldTail = old.subarray(
    oldIdentity - oldProfile.get("capitalBack"),
    oldIdentity,
  );
  const tail = Buffer.concat([
    oldTail.subarray(0, 39 * 4),
    integer(0),
    oldTail.subarray(39 * 4, 64 * 4),
    oldTail.subarray(64 * 4),
    Buffer.alloc(1),
  ]);
  const state = Buffer.alloc(1046 + 36);
  state.set(old.subarray(0, 24));
  state.writeUInt32LE(17);
  state.set(tail, 1046 - tail.length);
  state.set(old.subarray(oldIdentity, oldIdentity + 24), 1046);
  state.set(old.subarray(oldIdentity + 24, oldIdentity + 32), 1046 + 28);
  const current = read_capital(
    state,
    p.wrapJson({ id: 0, offset: 1046 }),
    p.get(PLAYER_PROFILES, "observed-eight-yield"),
    world,
  );
  assert.equal(current.get("capitalCityId"), "0:16385");
  state.writeInt32LE(9999, 1046 - 262);
  assert.throws(
    () =>
      read_capital(
        state,
        p.wrapJson({ id: 0, offset: 1046 }),
        p.get(PLAYER_PROFILES, "observed-eight-yield"),
        world,
      ),
    /capital reference does not uniquely match/,
  );
});

test("v10 units validate the newer archive boundary, identity and complete tail", () => {
  const [old, offset, limit, ref, tile, oldProfile] = decode(
    fixture("read_unit").args,
  );
  const expected = p.unwrap(
    read_unit(old, offset, limit, ref, tile, oldProfile),
  );
  const insertion =
    UNIT_PROFILES.get("observed-eight-yield") - UNIT_PROFILES.get(oldProfile);
  const boundary = offset + UNIT_PROFILES.get(oldProfile);
  const state = Buffer.concat([
    old.subarray(0, boundary),
    Buffer.alloc(insertion),
    old.subarray(boundary),
  ]);
  state.writeUInt32LE(10, offset);
  const actual = p.unwrap(
    read_unit(
      state,
      offset,
      limit + insertion,
      ref,
      tile,
      "observed-eight-yield",
    ),
  );
  assert.equal(actual.unitTypeHash, expected.unitTypeHash);
  assert.equal(actual.id, expected.id);
  assert.equal(actual.evidence.unitVersion, 10);
  assert.equal(
    actual.evidence.validatedThroughOffset,
    expected.evidence.validatedThroughOffset + insertion,
  );
  assert.throws(
    () => read_unit(state, offset, limit + insertion, ref, tile, oldProfile),
    /unsupported unit version/,
  );
  assert.throws(
    () =>
      read_unit(
        state,
        offset,
        limit + insertion - 1,
        ref,
        tile,
        "observed-eight-yield",
      ),
    /truncated/,
  );
  state.writeInt32LE(9999, offset + 16);
  assert.throws(
    () =>
      read_unit(
        state,
        offset,
        limit + insertion,
        ref,
        tile,
        "observed-eight-yield",
      ),
    /identity/,
  );
});

test("newer alliances require their additional boolean tail and following object boundary", () => {
  const [old, offset, , turn] = decode(fixture("read_minor_ai").args);
  const state = Buffer.concat([
    old.subarray(0, 2016),
    Buffer.alloc(592),
    old.subarray(2016, old.length - 4),
    Buffer.alloc(22),
    old.subarray(old.length - 4),
  ]);
  state.writeInt32LE(9, 4); // Data-driven personality, outside the SDK enum.
  const actual = read_minor_ai(state, offset, state.length, turn, 592, true);
  assert.equal(actual.get("ally"), 1);
  assert.equal(actual.get("allianceSinceTurn"), 10);
  assert.throws(
    () => read_minor_ai(state, offset, state.length, turn, 592),
    /personality/,
  );
  state[state.length - 26] = 2;
  assert.throws(
    () => read_minor_ai(state, offset, state.length, turn, 592, true),
    /boolean/,
  );
  state[state.length - 26] = 0;
  state.writeUInt32LE(2, state.length - 4);
  assert.throws(
    () => read_minor_ai(state, offset, state.length, turn, 592, true),
    /deal-AI boundary/,
  );
});

test("newer saves select their matching bundled metadata without changing the input world", async () => {
  const world = JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
  world.source.kind = "save";
  world.inspection = { profile: "observed-eight-yield" };
  const SQL = await initSqlJs({
    wasmBinary: fs.readFileSync("assets/wasm/sql-wasm.wasm"),
  });
  const db = new SQL.Database(
    fs.readFileSync("assets/databases/eight-yield/ruleset.db"),
  );
  const civs = db.exec(
    "SELECT ID,Type,Description FROM Civilizations ORDER BY ID LIMIT 3",
  )[0].values;
  const terrain = db.exec(
    "SELECT ID FROM Terrains WHERE Type='TERRAIN_GRASS'",
  )[0].values[0][0];
  const water = db.exec("SELECT ID FROM Terrains WHERE Type='TERRAIN_COAST'")[0]
    .values[0][0];
  db.close();
  for (const [i, civ] of world.civilizations.entries()) {
    [civ.rulesetId, civ.key, civ.nameKey] = civs[i];
    civ.kind = "major";
  }
  for (const tile of world.tiles) {
    tile.terrain = null;
    tile.terrainId = tile.landWater === "water" ? water : terrain;
  }
  world.cities[0].name = world.cities[0].nameKey = "TXT_KEY_CITY_NAME_KYOTO";
  const original = structuredClone(world),
    fetched = [],
    originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const name = new URL(url).pathname.slice(1);
      fetched.push(name);
      return new Response(fs.readFileSync("assets/" + name));
    };
    const result = await enrichBrowserWorld(world, {
      assetBase: "https://newer-metadata.invalid/",
    });
    assert.deepEqual(world, original);
    assert.ok(
      result.tiles.every(
        (t) =>
          t.terrain ===
          (t.landWater === "water" ? "TERRAIN_COAST" : "TERRAIN_GRASS"),
      ),
      result.extraction.warnings.join("; "),
    );
    assert.equal(result.cities[0].name, "Kyoto");
    assert.deepEqual(fetched.sort(), [
      "databases/eight-yield/localization.db",
      "databases/eight-yield/ruleset.db",
      "wasm/sql-wasm.wasm",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("both state headers report the saved turn and reject inconsistent turns", () => {
  const original = bytes(fixture("inspect_bytes").args[0]);
  const { world, state } = inspectSave(original, false);
  const legacy = Buffer.from(state);
  const newer = Buffer.concat([
    legacy.subarray(0, 4),
    integer(0),
    legacy.subarray(4),
  ]);
  const pack = (state) => {
    const compressed = deflateSync(state);
    return Buffer.concat([
      original.subarray(0, world.inspection.compression.offset - 4),
      integer(compressed.length),
      compressed,
    ]);
  };
  for (const [state, turnOffset] of [
    [legacy, 8],
    [newer, 12],
  ]) {
    assert.equal(
      inspectSave(pack(state), false).world.inspection.elapsedTurns,
      world.game.turn,
    );
    const invalid = Buffer.from(state);
    invalid.writeUInt32LE(world.game.turn + 1, turnOffset);
    assert.throws(
      () => extractSave(pack(invalid)),
      /setup\/state turn mismatch/,
    );
  }
});

test("eight-yield plot layout preserves coordinates, ownership and record boundaries", () => {
  const old = bytes(fixture("read_plots").args[0]);
  const reader = new Reader(old);
  const [expected] = read_plot(reader, p.wrapJson(PROFILES["bnw-six-yield"]));
  const record = old.subarray(0, reader.pos);
  // Three additional serialized flags and two additional short yield slots.
  const newer = Buffer.concat([
    record.subarray(0, 55),
    Buffer.alloc(3),
    record.subarray(55, 124),
    Buffer.alloc(4),
    record.subarray(124),
  ]);
  const newReader = new Reader(newer);
  const [actual] = read_plot(newReader, profile);
  assert.equal(newReader.pos, newer.length);
  assert.deepEqual(p.unwrap(actual), p.unwrap(expected));
  for (const name of ["bnw-six-yield", "observed-seven-yield"])
    assert.throws(() =>
      read_plot(new Reader(newer), p.wrapJson(PROFILES[name])),
    );
  assert.throws(
    () => read_plot(new Reader(newer.subarray(0, newer.length - 1)), profile),
    /truncated/,
  );
  const tile = p.unwrap(actual);
  const header = p.wrapJson({
    endOffset: 0,
    width: 1,
    height: 1,
    landPlots: tile.landWater === "land" ? 1 : 0,
    ownedPlots: tile.owner === null ? 0 : 1,
  });
  assert.equal(read_plots(newer, header, profile)[0].length, 1);
  header.set("ownedPlots", tile.owner === null ? 1 : 0);
  assert.throws(
    () => read_plots(newer, header, profile),
    /ownership aggregate mismatch/,
  );
});

test("eight-yield cities validate identities, names and the shifted city aggregate", () => {
  const oldFixture = fixture("read_city_candidate");
  const old = bytes(oldFixture.args[0]);
  const tile = p.dict(
    oldFixture.args[3].$dict.map(([key, value]) => [
      key,
      value?.$dict ? p.dict(value.$dict) : value,
    ]),
  );
  const expected = p.unwrap(
    read_city_candidate(old, 0, p.wrapJson(PROFILES["bnw-six-yield"]), tile),
  );
  const parts = [
    old.subarray(0, 4 + 60 * 4),
    old.subarray(4 + 66 * 4, 4 + 66 * 4 + 14),
    old.subarray(4 + 66 * 4 + 14, 4 + 66 * 4 + 14 + 12),
  ];
  let offset = 4 + 66 * 4 + 14 + 16;
  let firstVector;
  for (let i = 0; i < 16; i++) {
    assert.equal(old.readUInt32LE(offset), 6);
    const vector = Buffer.concat([
      integer(8),
      old.subarray(offset + 4, offset + 28),
      Buffer.alloc(8),
    ]);
    firstVector ??= vector;
    parts.push(vector);
    offset += 28;
  }
  parts.push(firstVector, firstVector);
  const nameOffset = offset + 2 * (4 + 5 * 4) + 2 * (4 + 80);
  parts.push(
    old.subarray(offset, nameOffset),
    Buffer.alloc(5),
    old.subarray(nameOffset),
  );
  const newer = Buffer.concat(parts);
  const actual = p.unwrap(read_city_candidate(newer, 0, profile, tile));
  delete actual.evidence;
  delete expected.evidence;
  assert.deepEqual(actual, expected);
  const stateHeader = Buffer.alloc(64);
  stateHeader.writeInt32LE(2, 40); // Legacy location deliberately disagrees.
  stateHeader.writeInt32LE(1, 44);
  const state = Buffer.concat([stateHeader, newer]);
  assert.equal(read_cities(state, [tile], 64, profile, 4).length, 1);
  assert.throws(
    () => read_cities(state, [tile], 64, profile),
    /city aggregate mismatch/,
  );
  state.writeInt32LE(99, 64 + 4 + 4); // Change saved X while keeping the plot reference.
  assert.throws(
    () => read_cities(state, [tile], 64, profile, 4),
    /0 valid current-state candidates/,
  );
});
