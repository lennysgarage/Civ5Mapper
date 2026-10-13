import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  renderSvg,
  validateWorld,
  replaySteps,
} from "../dist/core/src/index.js";
import {
  culturePair,
  cultureSources,
  cultureColor,
  cultureTerritory,
  cultureExports,
  cultureExportMaximum,
  cultureExportColor,
  cultureEmpireColor,
} from "../dist/core/src/culture_present.js";
import { readCultureRecord, extractCulture } from "../dist/core/src/culture.js";
import { renderHtml } from "../dist/core/src/html.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
import initSqlJs from "sql.js";
const fixture = () =>
  JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
function world() {
  const w = fixture();
  w.culture = {
    turn: 0,
    players: [
      {
        playerId: 0,
        alive: true,
        lifetimeCulture: 100,
        storedCulture: 10,
        accumulatedInfluence: { 0: 0, 1: 23 },
      },
      {
        playerId: 1,
        alive: true,
        lifetimeCulture: 200,
        accumulatedInfluence: { 0: 400, 1: 0 },
      },
    ],
  };
  return w;
}
test("culture direction, integer percentage, zero lifetime and unknown are distinct", () => {
  const w = world();
  assert.equal(culturePair(w, 0, 1).percent, 11);
  assert.equal(culturePair(w, 1, 0).percent, 400);
  assert.equal(culturePair(w, 0, 1).contact, null);
  assert.equal(culturePair(w, 0, 1).level, null);
  w.culture.players[1].lifetimeCulture = 0;
  assert.equal(culturePair(w, 0, 1).percent, 0);
  w.culture.players[1].lifetimeCulture = null;
  assert.equal(culturePair(w, 0, 1).percent, null);
  assert.equal(cultureTerritory(w, 0, 1).fill, "url(#culture-unknown)");
  w.culture.players[1].lifetimeCulture = 200;
  w.culture.players[0].accumulatedInfluence[1] = 0;
  assert.equal(cultureTerritory(w, 0, 1).fill, cultureColor(0));
  assert.notEqual(cultureColor(0), cultureTerritory(w, 0, 0).fill);
  assert.notEqual(
    cultureTerritory(w, 0, 2).fill,
    cultureTerritory(w, 0, 0).fill,
  );
  assert.equal(cultureColor(200), cultureColor(400));
});
test("game influence level requires verified contact and matching threshold metadata", () => {
  const w = world();
  w.culture.thresholds = {
    values: [10, 30, 60, 100, 200],
    source: "ruleset-database",
    databaseSha256: "a".repeat(64),
  };
  assert.equal(culturePair(w, 0, 1).level, null);
  w.culture.players[0].contact = { 1: false };
  assert.equal(culturePair(w, 0, 1).level, null);
  w.culture.players[0].contact[1] = true;
  assert.equal(culturePair(w, 0, 1).level, "exotic");
  w.culture.players[0].accumulatedInfluence[1] = 60;
  assert.equal(culturePair(w, 0, 1).level, "familiar");
});
test("culture snapshot validation and source selection exclude inactive and missing records", () => {
  const w = world();
  validateWorld(w);
  assert.deepEqual(cultureSources(w), [0, 1]);
  w.culture.players[1].alive = false;
  assert.deepEqual(cultureSources(w), []);
  // An inactive source is ineligible, and no active target remains.
  assert.throws(
    () => renderSvg(w, {}, { mode: "culture", perspective: 0 }),
    /requires verified/,
  );
  w.culture.players[1].alive = true;
  w.culture.turn = 1;
  assert.throws(() => validateWorld(w), /snapshot/);
  w.culture.turn = 0;
  w.culture.players[0].accumulatedInfluence[2] = 3;
  assert.throws(() => validateWorld(w), /influence/);
});
test("shared culture SVG has target colors, distinct source and city-state neutral, and capped legend", () => {
  const w = world();
  const svg = renderSvg(w, {}, { mode: "culture", perspective: 0 });
  assert.match(svg, /Tourism influence/);
  assert.match(svg, /culture-unknown/);
  assert.ok(svg.includes(`fill="${cultureColor(11)}"`));
  assert.equal(cultureTerritory(w, 0, 0).fill, cultureEmpireColor(w, 0));
  assert.match(svg, /data-tourism-role="source"[^>]*stroke-dasharray="6 3"/);
  assert.match(svg, /Tourism source:/);
  assert.match(svg, /class="culture-legend"/);
  assert.match(svg, /colors capped/);
  assert.throws(
    () => renderSvg(w, {}, { mode: "culture", perspective: 2 }),
    /perspective/,
  );
  const html = renderHtml(w, { css: "", js: "" }, {}, "culture", 1);
  assert.match(html, /id="perspective"/);
  const payload = JSON.parse(
    html.match(
      /<script id="world-data" type="application\/json">([\s\S]*?)<\/script>/,
    )[1],
  );
  assert.deepEqual(payload.world.culture, w.culture);
  assert.equal(payload.perspective, 1);
});
test("CLI culture mode defaults to overview and validates optional perspective and renders normalized JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "culture-test-"));
  try {
    const input = path.join(dir, "world.json"),
      output = path.join(dir, "map.svg");
    fs.writeFileSync(input, JSON.stringify(world()));
    const run = (...args) =>
      spawnSync(
        process.execPath,
        [
          "dist/cli/index.js",
          "render",
          input,
          "-o",
          output,
          "--mode",
          "culture",
          ...args,
        ],
        { encoding: "utf8" },
      );
    assert.equal(run().status, 0);
    assert.match(
      fs.readFileSync(output, "utf8"),
      /Accumulated tourism overview/,
    );
    assert.notEqual(run("--perspective", "-1").status, 0);
    const good = run("--perspective", "0");
    assert.equal(good.status, 0, good.stderr);
    assert.match(fs.readFileSync(output, "utf8"), /Tourism influence/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("replay does not inherit current cultural snapshot", () => {
  const replay = JSON.parse(fs.readFileSync("examples/synthetic-replay.json"));
  const w = [...replaySteps(replay, null, { wrapX: true })][0].world;
  w.culture = { turn: w.game.turn, players: [] };
  for (const step of replaySteps(replay, w, { wrapX: true }))
    assert.equal(step.world.culture, undefined);
});
test("optional extraction preserves unknown for unvalidated layouts and missing anchors", () => {
  const w = world();
  delete w.culture;
  w.inspection = { profile: "unsupported" };
  extractCulture(w, new Uint8Array());
  assert.equal(w.culture, undefined);
  assert.equal(w.extraction.fields.tourismInfluence, "unavailable");
  w.inspection = { profile: "observed-seven-yield" };
  extractCulture(w, new Uint8Array());
  assert.equal(w.culture, undefined);
});
test("bounded culture reader rejects wrong version, truncation and wrong notification owner", () => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(6);
  assert.throws(() => readCultureRecord(b, 0, 8, 0, 10, 10, 0), /truncated/);
  b.writeUInt32LE(7);
  assert.throws(() => readCultureRecord(b, 0, 8, 0, 10, 10, 0), /version/);
});
test("ruleset enrichment loads mod thresholds without inventing contact", async () => {
  const wasm = fs.readFileSync("assets/wasm/sql-wasm.wasm");
  await initRuleset(wasm);
  const SQL = await initSqlJs({ wasmBinary: wasm }),
    db = new SQL.Database();
  const w = world();
  w.civilizations = [];
  w.tiles = [];
  w.cities = [];
  db.run(
    "CREATE TABLE Civilizations (ID INTEGER, Type TEXT); CREATE TABLE Terrains (ID INTEGER, Type TEXT, Water INTEGER); CREATE TABLE Features (Type TEXT); CREATE TABLE Defines (Name TEXT, Value INTEGER);",
  );
  for (const [i, name] of [
    "EXOTIC",
    "FAMILIAR",
    "POPULAR",
    "INFLUENTIAL",
    "DOMINANT",
  ].entries())
    db.run("INSERT INTO Defines VALUES (?,?)", [
      "CULTURE_LEVEL_" + name,
      [12, 25, 50, 95, 190][i],
    ]);
  const result = enrichWorld(w, { ruleset: db.export() });
  db.close();
  assert.deepEqual(result.culture.thresholds.values, [12, 25, 50, 95, 190]);
  assert.equal(culturePair(result, 0, 1).contact, null);
});

function cultureRecord(owner = 0) {
  const chunks = [];
  const i = (n) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    chunks.push(b);
  };
  const bool = (n) => chunks.push(Buffer.from([n]));
  i(6);
  i(0);
  i(10);
  i(22);
  for (let slot = 0; slot < 22; slot++) {
    i(slot === owner ? 0 : 23);
    i(0);
  }
  bool(0);
  bool(0);
  i(-1);
  i(-1);
  i(0);
  i(0);
  i(0);
  for (let j = 0; j < 6; j++) i(-1);
  const ownerOffset = chunks.reduce((n, b) => n + b.length, 0) + 5;
  bool(1);
  i(2);
  i(owner);
  i(0);
  i(0);
  i(0);
  for (let slot = 0; slot < 100; slot++) {
    i(-1);
    i(0);
    i(0);
    for (let j = 0; j < 6; j++) i(-1);
    bool(0);
    i(8192); // unused notification payload is not a player reference
  }
  i(1);
  for (let j = 0; j < 9; j++) i(0);
  i(1);
  i(0);
  i(1);
  i(0);
  i(0);
  return { bytes: Buffer.concat(chunks), ownerOffset };
}
test("full culture boundary accepts empty notification payloads and rejects owner mismatch and treasury truncation", () => {
  const { bytes, ownerOffset } = cultureRecord();
  const value = readCultureRecord(bytes, 0, bytes.length, 0, 16, 10, 0);
  assert.equal(value.current[1], 23);
  assert.equal(value.lastLifetime, 10);
  assert.equal(value.boundaryEndOffset, bytes.length);
  const corrupt = Buffer.from(bytes);
  corrupt.writeInt32LE(1, ownerOffset);
  assert.throws(
    () => readCultureRecord(corrupt, 0, corrupt.length, 0, 16, 10, 0),
    /owner/,
  );
  assert.throws(
    () => readCultureRecord(bytes, 0, bytes.length - 1, 0, 16, 10, 0),
    /truncated/,
  );
});
test("empirical profile normalizes hundredths and rejects duplicate bounded culture records", () => {
  for (const [profile, prefixBytes] of [
    ["bnw-six-yield", 908],
    ["observed-seven-yield", 1050],
  ]) {
    const w = fixture(),
      state = Buffer.alloc(18000),
      { bytes } = cultureRecord();
    w.inspection = {
      profile,
      playerIdentities: [
        { id: 0, offset: prefixBytes, endOffset: 1100 },
        { id: 1, offset: 15000, endOffset: 15100 },
      ],
    };
    w.civilizations[0].capitalKnown = true;
    w.civilizations[0].capitalEvidence = {
      playerPrefixOffset: 0,
      playerAlive: true,
    };
    state.writeInt32LE(16);
    state.writeInt32LE(400, 36);
    state.writeInt32LE(1200, 40);
    bytes.copy(state, 1200);
    extractCulture(w, state);
    assert.equal(w.culture.players[0].lifetimeCulture, 12);
    assert.equal(w.culture.players[0].storedCulture, 4);
    assert.equal(w.culture.players[0].accumulatedInfluence[1], 23);
    bytes.copy(state, 7000);
    extractCulture(w, state);
    assert.equal(w.culture.players[0].lifetimeCulture, null);
    assert.ok(
      w.extraction.warnings.some((s) => s.includes("2 validated records")),
    );
  }
});

test("culture totals preserve exact integer ratios within SDK limits and reject larger values", () => {
  const w = world();
  w.culture.players[0].accumulatedInfluence[1] = 2147483647;
  w.culture.players[1].lifetimeCulture = 1;
  validateWorld(w);
  assert.equal(culturePair(w, 0, 1).percent, 214748364700);
  w.culture.players[0].accumulatedInfluence[1]++;
  assert.throws(() => validateWorld(w), /influence/);
});

test("bundled ruleset includes only five culture thresholds with matching manifest provenance", async () => {
  const wasm = fs.readFileSync("assets/wasm/sql-wasm.wasm");
  const SQL = await initSqlJs({ wasmBinary: wasm });
  const bytes = fs.readFileSync("assets/databases/ruleset.db"),
    db = new SQL.Database(bytes);
  try {
    const rows = db.exec("SELECT Name,Value FROM Defines ORDER BY Value")[0]
      .values;
    assert.deepEqual(
      rows.map((r) => r[0]),
      ["EXOTIC", "FAMILIAR", "POPULAR", "INFLUENTIAL", "DOMINANT"].map(
        (n) => "CULTURE_LEVEL_" + n,
      ),
    );
    assert.deepEqual(
      rows.map((r) => r[1]),
      [10, 30, 60, 100, 200],
    );
    const manifest = JSON.parse(
      fs.readFileSync("assets/databases/manifest.json"),
    );
    assert.equal(manifest.files.ruleset.rows.Defines, 5);
    assert.equal(
      manifest.files.ruleset.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(manifest.files.ruleset.bytes, bytes.length);
  } finally {
    db.close();
  }
});

test("overview shades each source by summed exports on a shared scale", () => {
  const w = world();
  assert.equal(cultureExports(w, 0).total, 23);
  assert.equal(cultureExports(w, 1).total, 400);
  assert.equal(cultureExportMaximum(w), 400);
  assert.equal(
    cultureTerritory(w, null, 0).fill,
    cultureColor((23 / 400) * 200),
  );
  assert.equal(cultureTerritory(w, null, 1).fill, cultureColor(200));
  assert.match(
    cultureTerritory(w, null, 0).description,
    /Total accumulated tourism exported: 23/,
  );
  assert.match(renderSvg(w, {}, { mode: "culture" }), /scale: 0–400/);
  w.culture.players[0].accumulatedInfluence[0] = 999;
  assert.equal(cultureExports(w, 0).total, 23, "self is excluded");
  w.culture.players[0].lifetimeCulture = null;
  w.culture.players[1].lifetimeCulture = null;
  assert.doesNotThrow(
    () => renderSvg(w, {}, { mode: "culture" }),
    "overview needs no lifetime denominator",
  );
  w.culture.players[0].accumulatedInfluence[1] = null;
  assert.equal(cultureExports(w, 0).total, null);
  assert.equal(cultureTerritory(w, null, 0).fill, "url(#culture-unknown)");
  w.culture.players[0].accumulatedInfluence[1] = 0;
  w.culture.players[1].accumulatedInfluence[0] = 0;
  assert.equal(cultureExportMaximum(w), 0);
  assert.equal(cultureTerritory(w, null, 0).fill, cultureColor(0));
  assert.equal(cultureTerritory(w, null, 1).fill, cultureColor(0));
});
test("export totals include eliminated major targets and retain incomplete totals as unknown", () => {
  const w = world();
  w.civilizations.push({
    id: 3,
    kind: "major",
    name: "Eliminated",
    eliminated: true,
  });
  w.culture.players.push({
    playerId: 3,
    alive: false,
    lifetimeCulture: 10,
    accumulatedInfluence: { 0: 1000, 1: 1000 },
  });
  w.culture.players[0].accumulatedInfluence[3] = 7;
  assert.equal(cultureExports(w, 0).total, 30);
  assert.equal(cultureExports(w, 1).total, null);
  assert.equal(
    cultureExportMaximum(w),
    30,
    "inactive sources do not set the scale",
  );
  assert.equal(cultureExports(w, 0).targets, 2, "city-states are excluded");
  w.culture.players = w.culture.players.filter((p) => p.playerId !== 0);
  assert.equal(cultureExports(w, 0).total, null);
  assert.equal(cultureTerritory(w, null, 0).fill, "url(#culture-unknown)");
});

test("gray source retains identity without turning influence targets gray", () => {
  const w = world();
  const before = cultureTerritory(w, 0, 1).fill;
  w.civilizations.find((c) => c.id === 0).color = "#888888";
  assert.equal(cultureTerritory(w, 0, 0).fill, "#888888");
  assert.equal(cultureTerritory(w, 0, 1).fill, before);
  assert.equal(cultureTerritory(w, 0, 1).fill, cultureColor(11));
  assert.equal(cultureTerritory(w, 1, 0).fill, cultureColor(200));
  const svg = renderSvg(w, {}, { mode: "culture", perspective: 0 });
  assert.match(svg, /Tourism source:/);
  assert.ok(svg.includes(`fill="${cultureColor(200)}"`));
});
