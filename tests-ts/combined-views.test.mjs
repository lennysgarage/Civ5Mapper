import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderSvg, validateWorld } from "../dist/core/src/index.js";
import { renderHtml } from "../dist/core/src/html.js";
import { initRuleset, enrichWorld } from "../dist/core/src/ruleset.js";
function world() {
  const w = JSON.parse(fs.readFileSync("examples/synthetic-religion.json"));
  w.culture = {
    turn: w.game.turn,
    players: [
      {
        playerId: 0,
        alive: true,
        lifetimeCulture: 100,
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
test("religion and tourism coexist in normalized JSON and viewer templates", () => {
  const w = world();
  validateWorld(w);
  assert.match(renderSvg(w, null, { mode: "culture" }), /scale: 0–400/);
  assert.match(
    renderSvg(w, null, { mode: "culture", perspective: 0 }),
    /Tourism source:/,
  );
  assert.match(
    renderSvg(w, null, { mode: "religion" }),
    /religion-heatmap-legend/,
  );
  const html = renderHtml(w, { css: "", js: "" });
  assert.match(html, /<template id="map-culture">/);
  assert.match(html, /<template id="map-religion">/);
  const data = JSON.parse(
    html.match(
      /<script id="world-data" type="application\/json">([\s\S]*?)<\/script>/,
    )[1],
  );
  assert.deepEqual(data.world.culture, w.culture);
  assert.deepEqual(data.world.religions, w.religions);
});
test("bundled metadata preserves tourism thresholds and religion labels together", async () => {
  await initRuleset(fs.readFileSync("assets/wasm/sql-wasm.wasm"));
  const w = world(),
    tiles = w.tiles,
    civs = w.civilizations;
  w.tiles = [];
  w.civilizations = [];
  delete w.religions;
  const result = enrichWorld(w, {
    ruleset: fs.readFileSync("assets/databases/ruleset.db"),
    localization: fs.readFileSync("assets/databases/localization.db"),
    religionMetadataTrusted: false,
  });
  assert.equal(result.culture.thresholds.values.length, 5);
  assert.equal(result.culture.players[0].accumulatedInfluence[1], 23);
  assert.equal(result.religions.find((r) => r.id === 2).name, "Catholicism");
  assert.equal(
    result.religions.find((r) => r.id === 1).metadataIdentity,
    "bundled-ruleset-id",
  );
  result.tiles = tiles;
  result.civilizations = civs;
  validateWorld(result);
});
