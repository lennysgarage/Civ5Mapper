import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import initSqlJs from "sql.js";
import {
  extractSave,
  inspectSave,
  renderSvg,
  parseReplay,
  replaySteps,
  Reader,
} from "../dist/core/src/index.js";
import { inflate } from "../dist/core/src/binary.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
import {
  initRaster,
  rasterize,
  exportReplay,
} from "../dist/core/src/raster.js";
import {
  renderHtml,
  playerControl,
  scriptJson,
} from "../dist/core/src/html.js";
import { addTurnOnePlayers } from "../dist/core/src/history.js";
import { crc32 } from "../dist/core/src/compat.js";
import {
  enrichBrowserWorld,
  metadataNeeds,
} from "../dist/core/src/browser_metadata.js";
import { deflateSync } from "node:zlib";
const fixture = (name) =>
  JSON.parse(fs.readFileSync(new URL("../examples/" + name, import.meta.url)));
const bytes = (name) =>
  fs.readFileSync(new URL("../assets/" + name, import.meta.url));
const assets = {
  css: fs.readFileSync("assets/viewer.css", "utf8"),
  js: fs.readFileSync("dist/viewer/viewer.js", "utf8"),
};
export function gifFrames(data) {
  let pos = 13,
    frames = 0;
  const skip = () => {
    while (data[pos]) pos += data[pos] + 1;
    pos++;
  };
  if (data[10] & 128) pos += 3 * (1 << ((data[10] & 7) + 1));
  while (pos < data.length) {
    const marker = data[pos++];
    if (marker === 59) return frames;
    if (marker === 33) {
      pos++;
      skip();
    } else if (marker === 44) {
      frames++;
      const flags = data[pos + 8];
      pos += 9;
      if (flags & 128) pos += 3 * (1 << ((flags & 7) + 1));
      pos++;
      skip();
    } else throw new Error("Invalid GIF block " + marker);
  }
  throw new Error("Missing GIF trailer");
}

test("bounded Reader and inflate reject corruption without hiding truncation", () => {
  const data = deflateSync(Buffer.alloc(1024, 42));
  const [out, eof] = inflate(data, 0, 2048);
  assert.equal(out.length, 1024);
  assert.equal(eof, true);
  assert.throws(() => inflate(data, 0, 64), /decompressed data exceeds/);
  assert.throws(
    () => new Reader(Uint8Array.of(17, 0, 0, 0, 0)).string(),
    /truncated field/,
  );
  assert.throws(
    () => new Reader(Uint8Array.of(1, 0, 0, 0, 255)).string(),
    /invalid UTF-8/,
  );
  assert.throws(() => extractSave(Uint8Array.of(0)), /expected CIV5|truncated/);
  assert.throws(() => inspectSave(Uint8Array.of(0)), /expected CIV5|truncated/);
});

test("SQLite metadata resolves hash identities read-only and rejects mismatched caches", async () => {
  const wasm = bytes("wasm/sql-wasm.wasm");
  await initRuleset(wasm);
  const SQL = await initSqlJs({ wasmBinary: wasm });
  const db = new SQL.Database();
  db.run(
    `CREATE TABLE Civilizations(ID,Type,Description);INSERT INTO Civilizations VALUES(4,'CIV_TEST','TXT_CIV');CREATE TABLE Terrains(ID,Type,Water);INSERT INTO Terrains VALUES(0,'TERRAIN_GRASS',0);CREATE TABLE Features(Type);INSERT INTO Features VALUES('FEATURE_TEST');CREATE TABLE Routes(ID,Type);INSERT INTO Routes VALUES(7,'ROUTE_ROAD');CREATE TABLE PlayerColors(Type,PrimaryColor);INSERT INTO PlayerColors VALUES('PLAYERCOLOR_TEST','COLOR_TEST');CREATE TABLE Colors(Type,Red,Green,Blue);INSERT INTO Colors VALUES('COLOR_TEST',0.2,0.4,0.6);CREATE TABLE Language_en_US(Tag,Text);INSERT INTO Language_en_US VALUES('TXT_CIV','Test Republic'),('TXT_CITY','New Town'),('TXT_UNIT','Test Infantry');CREATE TABLE Units(Type,Description,Domain,Combat,RangedCombat,NukeDamageLevel,CombatClass,Class);INSERT INTO Units VALUES('UNIT_TEST','TXT_UNIT','DOMAIN_LAND',10,0,-1,'UNITCOMBAT_GUN','UNITCLASS_INFANTRY'),('UNIT_WORKER','TXT_WORKER','DOMAIN_LAND',0,0,-1,NULL,NULL),('UNIT_NUKE','TXT_NUKE','DOMAIN_AIR',0,0,0,NULL,NULL);`,
  );
  const buffer = db.export();
  db.close();
  const before = buffer.slice(),
    hash = (s) =>
      ((crc32(new TextEncoder().encode(s)) ^ 0xffffffff) >>> 0)
        .toString(16)
        .padStart(8, "0");
  const world = {
    source: {},
    extraction: { fields: {} },
    civilizations: [
      { key: "CIV_TEST", rulesetId: 4, colorKey: "PLAYERCOLOR_TEST" },
    ],
    tiles: [
      {
        x: 0,
        y: 0,
        terrainId: 0,
        landWater: "land",
        featureHash: hash("FEATURE_TEST"),
        routeKnown: true,
        routeId: 7,
        route: null,
      },
    ],
    cities: [{ name: "TXT_CITY", nameKey: "TXT_CITY", capital: null }],
    units: ["UNIT_TEST", "UNIT_WORKER", "UNIT_NUKE"].map((s, i) => ({
      id: String(i),
      unitTypeHash: hash(s),
    })),
  };
  const original = structuredClone(world),
    result = enrichWorld(world, { ruleset: buffer, localization: buffer });
  assert.deepEqual(world, original);
  assert.deepEqual(buffer, before);
  assert.equal(result.civilizations[0].name, "Test Republic");
  assert.equal(result.civilizations[0].color, "#336699");
  assert.equal(result.tiles[0].route, "ROUTE_ROAD");
  assert.equal(result.tiles[0].feature, "FEATURE_TEST");
  assert.equal(result.cities[0].capital, null);
  assert.equal(result.cities[0].name, "New Town");
  assert.deepEqual(
    result.units.map((u) => u.isMilitary),
    [true, false, true],
  );
  assert.equal(result.units[0].combatClass, "UNITCOMBAT_GUN");
  assert.equal(result.units[0].name, "Test Infantry");
  for (const mutate of [
    (w) => (w.civilizations[0].rulesetId = 5),
    (w) => (w.tiles[0].landWater = "water"),
    (w) => (w.tiles[0].routeId = 8),
    (w) => (w.units[0].unitTypeHash = "00000001"),
  ]) {
    const w = structuredClone(world);
    mutate(w);
    assert.throws(() => enrichWorld(w, { ruleset: buffer }), /mismatch/);
  }
});

test("bundled browser databases resolve names, physical terrain and detailed armies with no selected files", async () => {
  // A synthetic world with real lookup identities; no private save is a fixture.
  const world = fixture("synthetic-world.json");
  const SQL = await initSqlJs({ wasmBinary: bytes("wasm/sql-wasm.wasm") });
  const db = new SQL.Database(bytes("databases/ruleset.db"));
  const types = db.exec("SELECT ID,Type FROM Terrains")[0].values;
  const civs = db.exec(
    "SELECT ID,Type,Description FROM Civilizations ORDER BY ID LIMIT 3",
  )[0].values;
  db.close();
  world.source.kind = "save";
  for (const [i, c] of world.civilizations.entries()) {
    c.rulesetId = civs[i][0];
    c.key = civs[i][1];
    c.nameKey = civs[i][2];
    c.kind = "major";
  }
  for (const t of world.tiles) {
    t.terrainId = types.find((r) => r[1] === t.terrain)[0];
    t.terrain = null;
  }
  world.cities[0].name = world.cities[0].nameKey = "TXT_KEY_CITY_NAME_KYOTO";
  world.units = [
    {
      id: "synthetic-unit",
      owner: 0,
      x: 0,
      y: 0,
      unitTypeHash: (
        (crc32(new TextEncoder().encode("UNIT_WARRIOR")) ^ 0xffffffff) >>>
        0
      )
        .toString(16)
        .padStart(8, "0"),
      classificationKnown: false,
      type: null,
      isMilitary: null,
    },
  ];
  world.extraction.fields.unitPositions = "extracted";
  const original = structuredClone(world),
    fetched = [],
    originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const name = new URL(url).pathname.replace(/^\/CivMapper\//, "");
      fetched.push(name);
      return new Response(bytes(name));
    };
    const options = { assetBase: "https://test.invalid/CivMapper/" };
    const result = await enrichBrowserWorld(world, options);
    assert.deepEqual(world, original);
    assert.equal(result.cities[0].name, "Kyoto");
    assert.equal(result.units[0].type, "UNIT_WARRIOR");
    assert.equal(result.units[0].isMilitary, true);
    assert.equal(result.units[0].combatClass, "UNITCOMBAT_MELEE");
    assert.deepEqual(metadataNeeds(result), {
      cityNames: 0,
      terrain: false,
      military: false,
    });
    assert.match(
      renderSvg(result, {}, { mode: "physical" }),
      /Physical terrain/,
    );
    assert.match(
      renderSvg(result, { armyIcons: "detailed" }, { mode: "army" }),
      /army-marker/,
    );
    assert.deepEqual(fetched.sort(), [
      "databases/localization.db",
      "databases/ruleset.db",
      "wasm/sql-wasm.wasm",
    ]);
    await enrichBrowserWorld(world, options);
    assert.equal(
      fetched.length,
      3,
      "metadata downloads are reused during the session",
    );
    assert.deepEqual(
      await enrichBrowserWorld(world, { ...options, bundledMetadata: false }),
      original,
    );
    const localizationOnly = await enrichBrowserWorld(world, {
      ...options,
      bundledMetadata: false,
      localization: { bytes: bytes("databases/localization.db") },
    });
    assert.equal(localizationOnly.cities[0].name, "Kyoto");
    assert.equal(localizationOnly.tiles[0].terrain, null);
    assert.equal(localizationOnly.units[0].classificationKnown, false);
    await assert.rejects(
      () =>
        enrichBrowserWorld(world, {
          ...options,
          bundledMetadata: false,
          localization: {
            bytes: new TextEncoder().encode("invalid database").buffer,
          },
        }),
      /database|malformed/,
    );
    const normalized = structuredClone(result);
    normalized.cities[0].name = "User edited city";
    assert.deepEqual(await enrichBrowserWorld(normalized, options), normalized);
    const mismatch = structuredClone(world);
    mismatch.civilizations[0].rulesetId = -1;
    const partial = await enrichBrowserWorld(mismatch, options);
    assert.equal(partial.tiles[0].terrain, null);
    assert.equal(partial.units[0].classificationKnown, false);
    assert.match(
      partial.extraction.warnings.at(-1),
      /Bundled metadata unavailable.*civilization ID mismatch/,
    );
    await assert.rejects(
      () =>
        enrichBrowserWorld(mismatch, {
          ...options,
          ruleset: { bytes: bytes("databases/ruleset.db") },
        }),
      /civilization ID mismatch/,
    );
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    const missing = await enrichBrowserWorld(world, {
      assetBase: "https://missing.invalid/",
    });
    assert.match(
      missing.extraction.warnings.at(-1),
      /Could not load bundled metadata \(404\)/,
    );
    assert.equal(missing.tiles[0].terrain, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shared rasterizer produces PNG and deterministic captioned replay GIF", async () => {
  await initRaster(bytes("wasm/resvg.wasm"), [
    bytes("fonts/DejaVuSerif.ttf"),
    bytes("fonts/DejaVuSans.ttf"),
  ]);
  const png = rasterize(renderSvg(fixture("synthetic-world.json")), 0.25);
  assert.deepEqual([...png.png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.width > 0 && png.height > 0);
  const replay = fixture("synthetic-replay.json"),
    options = { wrapX: true, maxturns: 2, captions: true, duration: 120 };
  const a = exportReplay(replay, null, options),
    b = exportReplay(replay, null, options);
  assert.deepEqual(a.data, b.data);
  assert.equal(Buffer.from(a.data.slice(0, 6)).toString(), "GIF89a");
  assert.equal(gifFrames(a.data), 2);
  assert.equal(a.frames.length, 2);
  assert.ok(a.frames.some((f) => f.captions.length));
  assert.throws(
    () => exportReplay(replay, null, { ...options, mode: "army" }),
    /historical unit positions/,
  );
  assert.throws(
    () => exportReplay(replay, null, { ...options, scale: NaN }),
    /scale/,
  );
  assert.throws(
    () => exportReplay(replay, null, { ...options, duration: 0 }),
    /duration/,
  );
  const states = [...replaySteps(replay, null, { wrapX: true })];
  assert.equal(states.length, 3);
  assert.equal(states.at(-1).world.cities.length, 0);
  assert.throws(
    () => [...replaySteps(replay, null, { wrapX: true, maxturns: 1.5 })],
    /maxturns/,
  );
});

test("HTML retains grouping and escapes game names without enabling unsupported armies", () => {
  assert.equal(
    playerControl({
      kind: "major",
      playerName: "Former player",
      setupSlotStatus: 1,
    }),
    "human",
  );
  assert.equal(playerControl({ kind: "major", setupSlotStatus: 3 }), "human");
  assert.equal(playerControl({ kind: "major", setupSlotStatus: 1 }), "ai");
  assert.equal(
    playerControl({ kind: "city-state", playerName: "Minor" }),
    "other",
  );
  const world = fixture("synthetic-world.json");
  world.cities[0].name = '</script><img src=x onerror="alert(1)">';
  world.source.kind = "save";
  world.game.turn = "<script>alert(1)</script>";
  const html = renderHtml(world, assets);
  assert.ok(html.includes("Export PNG"));
  assert.ok(html.includes("Export SVG"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(scriptJson(world).includes("\\u003c"));
  assert.ok(
    html.includes("army disabled") || html.includes('value="army" disabled'),
  );
  const duplicate = structuredClone(world);
  duplicate.cities[1].id = duplicate.cities[0].id;
  assert.throws(() => renderHtml(duplicate, assets), /unique city IDs/);
});

test("turn-one evidence validates exact geography but does not change default groups", () => {
  const world = fixture("synthetic-world.json");
  world.source.kind = "save";
  world.game.turn = 100;
  const ref = structuredClone(world);
  ref.game.turn = 1;
  for (const c of ref.civilizations) c.setupSlotStatus = 1;
  const result = addTurnOnePlayers(world, ref);
  assert.equal(result.game.turnOnePlayerEvidence.turn, 1);
  assert.equal(world.game.turnOnePlayerEvidence, undefined);
  ref.game.turn = 0;
  assert.throws(() => addTurnOnePlayers(world, ref), /turn-1/);
  ref.game.turn = 1;
  ref.tiles[0].elevation = "mountain";
  assert.throws(() => addTurnOnePlayers(world, ref), /geography mismatch/);
});

test("Node CLI retains commands, fail-loud behavior and input path protection", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "civmapper-cli-"));
  const cli = path.resolve("dist/cli/index.js"),
    run = (args) =>
      spawnSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        cwd: temp,
      });
  try {
    assert.equal(run(["--help"]).status, 0);
    assert.equal(run(["styles"]).status, 0);
    assert.equal(run(["serve"]).status, 2);
    const input = path.resolve("examples/synthetic-world.json"),
      out = path.join(temp, "map.svg");
    assert.equal(
      run(["render", input, "-o", out, "--style", "parchment"]).status,
      0,
    );
    assert.match(fs.readFileSync(out, "utf8"), /SYNTHETIC DEMO/);
    assert.equal(run(["render", input, "-o", input]).status, 2);
    assert.equal(run(["render", input, "-o", out, "--mode", "army"]).status, 2);
    assert.equal(
      run(["render", input, "-o", out, "--army-icons", "detailed"]).status,
      2,
    );
    const corrupt = path.join(temp, "bad.Civ5Save");
    fs.writeFileSync(corrupt, "bad");
    assert.equal(
      run(["extract", corrupt, "-o", path.join(temp, "bad.json")]).status,
      2,
    );
    assert.ok(!fs.existsSync(path.join(temp, "bad.json")));
    const alias = path.join(temp, "alias.json");
    fs.symlinkSync(input, alias);
    assert.equal(run(["render", input, "-o", alias]).status, 2);
    const replay = path.resolve("examples/synthetic-replay.json"),
      gif = path.join(temp, "replay.gif");
    const r = run([
      "render-replay",
      "--replay",
      replay,
      "--wrap-x",
      "--maxturns",
      "2",
      "--captions",
      "-o",
      gif,
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(gifFrames(fs.readFileSync(gif)), 2);
    assert.equal(
      run([
        "render-replay",
        "--replay",
        replay,
        "--wrap-x",
        "--mode",
        "army",
        "-o",
        gif,
      ]).status,
      2,
    );
    assert.equal(
      run([
        "render-replay",
        "--replay",
        replay,
        "--wrap-x",
        "--no-wrap-x",
        "-o",
        gif,
      ]).status,
      2,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
