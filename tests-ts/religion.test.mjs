import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderSvg, validateWorld } from "../dist/core/src/index.js";
import {
  religiousMajority,
  territoryReligion,
  religionName,
  religionSummary,
  religionMarker,
  religionColor,
  religionPresence,
  religionHeatColor,
} from "../dist/core/src/religion.js";
import {
  readCityReligionBlock,
  locateCityReligion,
  extractReligionCatalog,
} from "../dist/core/src/religion_extract.js";
import { renderHtml } from "../dist/core/src/html.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
import initSqlJs from "sql.js";
const fixture = () =>
  JSON.parse(fs.readFileSync("examples/synthetic-religion.json", "utf8"));
const rec = (religionId, followers, pressure = 100, holyCity = false) => ({
  religionId,
  followers,
  pressure,
  holyCity,
});
const i32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const byte = (n) => Buffer.from([n]);
const hash = (key, value, size = 4) =>
  Buffer.concat([i32(1), i32(key), size === 1 ? byte(value) : i32(value)]);
function block(records) {
  return Buffer.concat([
    i32(3),
    byte(0),
    i32(0),
    i32(records.length),
    ...records.map((r) =>
      Buffer.concat([
        i32(2),
        i32(r.religionId),
        byte(r.holyCity ? 1 : 0),
        i32(r.followers),
        i32(r.pressure),
        i32(0),
      ]),
    ),
  ]);
}
function tail(records = [rec(-1, 1), rec(1, 9, 500, true)]) {
  const name = Buffer.from("TEST_CITY"),
    marker = Buffer.concat([i32(name.length), name]);
  return Buffer.concat([
    Buffer.alloc(50),
    i32(10),
    i32(0),
    i32(0),
    byte(0),
    byte(0),
    marker,
    byte(0),
    i32(1),
    i32(1),
    i32(7),
    hash(101, 0, 1),
    hash(101, -1),
    i32(-1),
    i32(1),
    i32(1),
    hash(171, 0),
    i32(1),
    hash(172, 0),
    i32(1),
    Buffer.alloc(6 * 4),
    i32(1),
    hash(173, 0),
    i32(1),
    byte(0),
    byte(1),
    i32(0),
    i32(10),
    i32(0),
    i32(-1),
    byte(0),
    byte(1),
    Buffer.alloc(36),
    Buffer.alloc(37),
    i32(0),
    i32(0),
    hash(111, 0),
    hash(111, 0),
    hash(777, 0),
    hash(777, 0),
    hash(111, 0),
    block(records),
    i32(1),
    Buffer.alloc((2 + 6) * 4),
    hash(88, 0, 1),
    i32(0),
    ...Array.from({ length: 9 }, () =>
      Buffer.concat([i32(22), Buffer.alloc(22 * 4)]),
    ),
    i32(0),
  ]);
}
const city = {
  name: "TEST_CITY",
  population: 10,
  evidence: { nameEndOffset: 0 },
};

test("religion majority includes unaffiliated citizens, exact half, pressure and ordered ties", () => {
  assert.equal(religiousMajority([rec(1, 5), rec(-1, 5, 50)]), 1);
  assert.equal(religiousMajority([rec(1, 5), rec(2, 5, 200)]), 2);
  assert.equal(religiousMajority([rec(2, 5), rec(1, 5)]), 2);
  assert.equal(religiousMajority([rec(1, 3), rec(2, 3), rec(-1, 4)]), -1);
  assert.equal(religiousMajority([rec(0, 7), rec(-1, 3)]), 0);
  assert.equal(religiousMajority([]), -1);
});
test("structural city tail requires one complete bounded neighboring-object chain", () => {
  const data = tail(),
    decoded = locateCityReligion(data, city, data.length, 6);
  assert.equal(decoded.majorityReligionId, 1);
  assert.equal(decoded.records[1].holyCity, true);
  assert.equal(decoded.evidence.projectCount, 6);
  assert.equal(decoded.evidence.tailEndOffset, data.length);
  assert.throws(
    () => locateCityReligion(data, city, data.length - 1, 6),
    /unavailable/,
  );
  assert.throws(
    () =>
      locateCityReligion(Buffer.concat([data, data]), city, data.length * 2, 6),
    /ambiguous/,
  );
  assert.throws(
    () => locateCityReligion(tail([rec(1, 11)]), city, data.length, 6),
    /unavailable/,
  );
  const unknownVersion = Buffer.from(data);
  unknownVersion.writeInt32LE(99, decoded.evidence.offset);
  assert.throws(
    () => locateCityReligion(unknownVersion, city, data.length, 6),
    /unavailable/,
  );
  const empty = tail([]);
  assert.equal(
    locateCityReligion(empty, city, empty.length, 6).majorityReligionId,
    -1,
  );
});
test("religion block rejects unsupported, truncated, duplicate and inconsistent records", () => {
  assert.throws(() => readCityReligionBlock(i32(99), 0, 10), /unsupported/);
  const data = block([rec(1, 5)]);
  assert.throws(
    () => readCityReligionBlock(data.subarray(0, data.length - 1), 0, 10),
    /truncated/,
  );
  assert.throws(
    () => readCityReligionBlock(block([rec(1, 2), rec(1, 3)]), 0, 10),
    /duplicate/,
  );
  assert.throws(
    () => readCityReligionBlock(block([rec(1, 11)]), 0, 10),
    /exceed/,
  );
});
test("territory uses exact saved city assignment, with neutral missing and inconsistent references", () => {
  const w = fixture(),
    t = w.tiles.find((t) => t.owner === 0 && t.landWater === "land");
  t.territoryCityReference = { owner: 0, localId: 2 };
  assert.equal(territoryReligion(w, t), -1);
  t.territoryCityReference.localId = 1;
  assert.equal(territoryReligion(w, t), 1);
  t.territoryCityReference.owner = 1;
  assert.equal(territoryReligion(w, t), null);
  t.territoryCityReference = { owner: 0, localId: 999 };
  assert.equal(territoryReligion(w, t), null);
  t.territoryCityReference = null;
  assert.equal(territoryReligion(w, t), null);
  t.territoryCityKnown = false;
  assert.equal(territoryReligion(w, t), null);
});
test("normalized religion mode keeps holy status independent, escapes names, and preserves old worlds", () => {
  const w = fixture(),
    original = structuredClone(w);
  validateWorld(w);
  const svg = renderSvg(w, null, { mode: "religion", interactive: true });
  assert.match(svg, /SYNTHETIC DEMO/);
  assert.match(svg, /religion-territory/);
  assert.match(svg, /holy-city-marker/);
  assert.match(svg, /Greenhaven.*Tidekeepers; holy city: Sunrise Fellowship/);
  assert.match(svg, /religion-legend/);
  assert.match(
    svg,
    /data-owner="0" data-surface="land"[^>]*data-religion-id="-1"/,
  );
  assert.deepEqual(w, original);
  w.religions[0].customName = "<saved & name>";
  w.religions[0].name = "Wrong DB name";
  assert.equal(religionName(w, 1), "<saved & name>");
  assert.match(
    renderSvg(w, null, { mode: "religion" }),
    /&lt;saved &amp; name&gt;/,
  );
  const old = JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
  assert.match(renderSvg(old), /SYNTHETIC DEMO/);
  assert.throws(
    () => renderSvg(old, null, { mode: "religion" }),
    /requires validated/,
  );
  const unknown = fixture();
  unknown.cities[0].religionKnown = false;
  unknown.cities[0].religions = null;
  unknown.cities[0].majorityReligionId = null;
  assert.match(
    renderSvg(unknown, null, { mode: "religion" }),
    /Religion unknown/,
  );
  const malformed = fixture();
  malformed.cities[0].majorityReligionId = 2;
  assert.throws(() => validateWorld(malformed), /majority/);
});
test("HTML availability and CLI SVG, PNG and HTML expose the same religion view", () => {
  const w = fixture(),
    assets = { css: "", js: "" };
  assert.match(renderHtml(w, assets), /<template id="map-religion">/);
  const old = JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
  assert.match(renderHtml(old, assets), /value="religion" disabled/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "religion-exports-"));
  try {
    for (const ext of ["svg", "png", "html"]) {
      const out = path.join(dir, `religion.${ext}`);
      const result = spawnSync(
        process.execPath,
        [
          "dist/cli/index.js",
          "render",
          "examples/synthetic-religion.json",
          "--mode",
          "religion",
          "--output",
          out,
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      const bytes = fs.readFileSync(out);
      if (ext === "png")
        assert.deepEqual(
          [...bytes.subarray(0, 8)],
          [137, 80, 78, 71, 13, 10, 26, 10],
        );
      else assert.match(bytes.toString(), /religion-territory/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("optional religion metadata missing from an older DB preserves terrain enrichment", async () => {
  const wasm = fs.readFileSync("assets/wasm/sql-wasm.wasm");
  await initRuleset(wasm);
  const SQL = await initSqlJs({ wasmBinary: wasm }),
    db = new SQL.Database();
  db.run(
    "CREATE TABLE Civilizations(ID,Type,Description); CREATE TABLE Terrains(ID,Type,Water); CREATE TABLE Features(Type); CREATE TABLE MinorCivilizations(Type,Description);",
  );
  const w = fixture();
  w.civilizations = [];
  w.tiles = [{ terrainId: 0, landWater: "land", x: 0, y: 0 }];
  db.run("INSERT INTO Terrains VALUES(0,'TERRAIN_GRASS',0)");
  const result = enrichWorld(w, { ruleset: db.export() });
  db.close();
  assert.equal(result.tiles[0].terrain, "TERRAIN_GRASS");
  assert.ok(
    result.extraction.warnings.some((s) => s.includes("no Religions table")),
  );
});

test("bundled metadata supplies readable religion labels with provenance", async () => {
  await initRuleset(fs.readFileSync("assets/wasm/sql-wasm.wasm"));
  const w = fixture();
  const civilizations = w.civilizations;
  const tiles = w.tiles;
  w.tiles = [];
  w.civilizations = [];
  delete w.religions;
  const result = enrichWorld(w, {
    ruleset: fs.readFileSync("assets/databases/ruleset.db"),
    localization: fs.readFileSync("assets/databases/localization.db"),
    religionMetadataTrusted: false,
  });
  const religion = result.religions.find((r) => r.id === 1);
  assert.ok(religion.name && !religion.name.startsWith("TXT_KEY_"));
  assert.equal(religion.metadataIdentity, "bundled-ruleset-id");
  assert.equal(religionName(result, 1), religion.name);
  result.civilizations = civilizations;
  result.tiles = tiles;
  assert.match(
    renderSvg(result, null, { mode: "religion" }),
    new RegExp(religion.name),
  );
});

test("plot decoder reads the purchase reference, not working/override/resource pairs", async () => {
  const { gunzipSync } = await import("node:zlib");
  const p = await import("../dist/core/src/compat.js");
  const { read_plots, read_plot } = await import("../dist/core/src/extract.js");
  const { Reader } = await import("../dist/core/src/binary.js");
  const fixtures = JSON.parse(
    gunzipSync(fs.readFileSync("tests-ts/fixtures/python-parity.json.gz")),
  );
  const legacy = fixtures.find(
    (f) => f.module === "extract" && f.function === "read_plots" && !f.error,
  );
  const decode = (v) =>
    v?.$bytes
      ? Uint8Array.from(Buffer.from(v.$bytes, "base64"))
      : v?.$dict
        ? p.dict(v.$dict.map(([k, v]) => [decode(k), decode(v)]))
        : Array.isArray(v)
          ? v.map(decode)
          : v;
  const args = decode(legacy.args),
    [tiles, evidence] = read_plots(...args),
    profile = p.unwrap(args[2]);
  const offset = p.unwrap(evidence).records[0].offset,
    data = Buffer.from(args[0]);
  const start = offset + profile.ownerOffset + 37;
  for (let i = 0; i < 4; i++) {
    data.writeInt32LE(0, start + i * 8);
    data.writeInt32LE(10 + i, start + i * 8 + 4);
  }
  const [tile] = read_plot(new Reader(data, offset), args[2]);
  assert.deepEqual(p.unwrap(tile).territoryCityReference, {
    owner: 0,
    localId: 13,
  });
  data.writeInt32LE(-1, start + 24);
  const [invalid] = read_plot(new Reader(data, offset), args[2]);
  assert.equal(p.unwrap(invalid).territoryCityKnown, false);
  assert.equal(p.unwrap(invalid).territoryCityReference, null);
});

test("global names require a complete container and independent holy-city coordinate match", () => {
  const w = fixture();
  w.game.turn = 3;
  w.cities = [
    {
      id: "0:1",
      owner: 0,
      x: 4,
      y: 4,
      population: 10,
      religionKnown: true,
      religions: [rec(1, 10, 100, true)],
    },
  ];
  const custom = Buffer.alloc(128);
  custom.write("Saved <Sunrise>");
  const prefix = Buffer.concat([
    i32(4),
    i32(10),
    i32(1),
    i32(4),
    i32(1),
    i32(0),
    i32(4),
    i32(4),
    i32(2),
    byte(0),
    byte(1),
    custom,
    i32(2),
    Buffer.alloc(26 * 4),
    i32(1),
    i32(123456),
    hash(444, 1),
  ]);
  w.inspection = { plots: { offset: prefix.length } };
  extractReligionCatalog(w, prefix);
  assert.equal(w.extraction.fields.religionCatalog, "extracted");
  assert.equal(w.religions[0].customName, "Saved <Sunrise>");
  assert.equal(w.religions[0].customNameKnown, true);
  const unknown = structuredClone(w);
  delete unknown.religions;
  unknown.cities[0].x = 5;
  extractReligionCatalog(unknown, prefix);
  assert.equal(unknown.extraction.fields.religionCatalog, "unavailable");
  assert.equal(unknown.religions, undefined);
});

test("replays strip current religion and territory assignments from snapshot and scenario bases", async () => {
  const { replaySteps } = await import("../dist/core/src/index.js");
  const replay = JSON.parse(fs.readFileSync("examples/synthetic-replay.json"));
  const base = fixture();
  replay.game.width = base.game.width;
  replay.game.height = base.game.height;
  replay.tiles = base.tiles.map((t) => ({
    x: t.x,
    y: t.y,
    plotType:
      t.landWater === "water"
        ? 3
        : t.elevation === "mountain"
          ? 0
          : t.elevation === "hills"
            ? 1
            : 2,
    terrainId: 0,
    riverEdges: t.riverEdges ?? [],
  }));
  replay.civilizations = base.civilizations;
  replay.events = replay.events.map((e) => ({
    ...e,
    tiles: e.tiles.map(() => ({ x: 4, y: 4 })),
  }));
  for (const kind of ["synthetic", "map"]) {
    base.source.kind = kind;
    const frames = [
      ...replaySteps(replay, base, { ownerMap: { 0: 0, 1: 1, 2: 2 } }),
    ];
    for (const { world } of frames) {
      assert.equal(world.religions, undefined);
      assert.ok(
        world.tiles.every(
          (t) =>
            !("territoryCityReference" in t) && !("territoryCityKnown" in t),
        ),
      );
      assert.ok(
        world.cities.every(
          (c) => !("religionKnown" in c) && !("religions" in c),
        ),
      );
      assert.throws(
        () => renderSvg(world, null, { mode: "religion" }),
        /requires validated/,
      );
    }
  }
});

test("religion summary separates majority, presence, unaffiliated followers and independent holy status", () => {
  const w = fixture();
  const summary = religionSummary(w);
  const first = summary.find((e) => e.id === 1);
  assert.equal(first.followers, 15);
  assert.equal(first.majorityCities, 1);
  assert.equal(first.presentCities, 3);
  assert.deepEqual(
    first.holyCities.map((c) => c.name),
    ["Greenhaven"],
  );
  assert.equal(summary.find((e) => e.id === -1).followers, 8);
  assert.equal(summary.find((e) => e.id === -1).majorityCities, 1);
  const city = w.cities.find((c) => c.name === "Greenhaven");
  const marker = religionMarker(w, city, 20, 20, "");
  assert.match(marker, /data-religion-id="2"/);
  assert.match(marker, /data-holy-religion-ids="1"/);
  assert.ok(marker.includes(`data-holy-religion-id="1"`));
  assert.ok(marker.includes(`fill="${religionColor(1)}"`));
  city.religionKnown = false;
  delete city.religions;
  delete city.majorityReligionId;
  const partial = religionSummary(w);
  assert.equal(partial.find((e) => e.id === null).majorityCities, 1);
  assert.equal(partial.find((e) => e.id === null).followers, null);
  assert.equal(partial.find((e) => e.id === 1).followers, 12);
});

test("standard faith colors are unique and Catholicism differs strongly from Orthodoxy", () => {
  assert.equal(
    new Set(Array.from({ length: 13 }, (_, i) => religionColor(i + 1))).size,
    13,
  );
  const rgb = (color) =>
    [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const a = rgb(religionColor(2)),
    b = rgb(religionColor(12));
  assert.ok(Math.hypot(...a.map((n, i) => n - b[i])) > 150);
});
test("heatmap shows minority followers and preserves unknown versus known zero", () => {
  const w = fixture(),
    city = w.cities.find((c) => c.name === "Greenhaven");
  assert.equal(city.majorityReligionId, 2);
  assert.deepEqual(religionPresence(city, 1), { followers: 3, share: 0.3 });
  assert.notEqual(religionHeatColor(1, 0.3), religionHeatColor(1, 0));
  assert.equal(religionHeatColor(1, 1), religionColor(1));
  assert.equal(religionHeatColor(1, null), religionColor(null));
  assert.deepEqual(religionPresence(city, 13), { followers: 0, share: 0 });
  assert.deepEqual(religionPresence(null, 1), { followers: null, share: null });
  const svg = renderSvg(w, null, { mode: "religion", interactive: true });
  assert.match(svg, /data-religion-city="1:1"/);
  assert.match(svg, /religion-heatmap-legend/);
});
