import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import initSqlJs from "sql.js";
import { crc32 } from "../dist/core/src/compat.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
import { naturalWonderLabelTiles } from "../dist/core/src/natural_wonders.js";
import { renderSvg } from "../dist/core/src/index.js";
const hash = (key) =>
  ((crc32(new TextEncoder().encode(key)) ^ 0xffffffff) >>> 0)
    .toString(16)
    .padStart(8, "0");

for (const folder of ["databases", "databases/eight-yield"])
  test(`${folder} resolves recorded wonder hashes and localized names without guessing from terrain`, async () => {
    const read = (name) => fs.readFileSync(`assets/${name}`);
    const ruleset = read(`${folder}/ruleset.db`),
      localization = read(`${folder}/localization.db`);
    const SQL = await initSqlJs({ wasmBinary: read("wasm/sql-wasm.wasm") });
    const db = new SQL.Database(ruleset);
    const civs = db.exec(
      "SELECT ID,Type,Description FROM Civilizations ORDER BY ID LIMIT 3",
    )[0].values;
    const terrains = new Map(db.exec("SELECT Type,ID FROM Terrains")[0].values);
    db.close();
    const world = JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
    for (const [i, civ] of world.civilizations.entries()) {
      [civ.rulesetId, civ.key, civ.nameKey] = civs[i];
      civ.kind = "major";
    }
    for (const tile of world.tiles) tile.terrainId = terrains.get(tile.terrain);
    const land = world.tiles.filter((t) => t.landWater === "land");
    land[0].featureHash = hash("FEATURE_LAKE_VICTORIA");
    land[1].featureHash = hash("FEATURE_FOREST");
    const original = structuredClone(world);
    await initRuleset(read("wasm/sql-wasm.wasm"));
    const result = enrichWorld(world, { ruleset, localization });
    assert.deepEqual(world, original);
    const victoria = result.tiles.find(
      (t) => t.x === land[0].x && t.y === land[0].y,
    );
    assert.equal(victoria.feature, "FEATURE_LAKE_VICTORIA");
    assert.equal(victoria.naturalWonder.name, "Lake Victoria");
    assert.equal(
      result.tiles.find((t) => t.x === land[1].x && t.y === land[1].y)
        .naturalWonder,
      undefined,
    );
    const stale = structuredClone(result);
    const normalTile = stale.tiles.find(
      (t) => t.x === land[1].x && t.y === land[1].y,
    );
    normalTile.naturalWonder = structuredClone(victoria.naturalWonder);
    const refreshed = enrichWorld(stale, { ruleset, localization });
    assert.equal(
      refreshed.tiles.find((t) => t.x === normalTile.x && t.y === normalTile.y)
        .naturalWonder,
      undefined,
    );
    for (const mode of ["political", "physical"]) {
      const svg = renderSvg(result, {}, { mode });
      assert.match(svg, /data-natural-wonder="FEATURE_LAKE_VICTORIA"/);
      assert.match(svg, /Lake Victoria/);
      assert.doesNotMatch(
        renderSvg(result, { showNaturalWonders: false }, { mode }),
        /class="natural-wonder-marker"/,
      );
    }
    victoria.naturalWonder.name = '<Lake & "Victoria">';
    assert.match(renderSvg(result), /&lt;Lake &amp;/);
    assert.doesNotMatch(renderSvg(result), /<Lake &/);
  });

test("multi-tile wonders share a label, including connected tiles across the wrap seam", () => {
  const tile = (x, y, type = "FEATURE_REEF") => ({
    x,
    y,
    naturalWonder: { type, name: type },
  });
  const tiles = [tile(0, 0), tile(1, 0), tile(3, 0), { x: 2, y: 0 }];
  assert.deepEqual(
    [...naturalWonderLabelTiles(tiles, 4, false)],
    ["0,0", "3,0"],
  );
  assert.deepEqual([...naturalWonderLabelTiles(tiles, 4, true)], ["0,0"]);
  assert.equal(
    naturalWonderLabelTiles([tile(15, 9), tile(15, 10)], 56, true).size,
    1,
  );
  assert.equal(
    naturalWonderLabelTiles(
      [tile(0, 0), tile(1, 0, "FEATURE_LAKE_VICTORIA")],
      4,
      true,
    ).size,
    2,
  );
});
