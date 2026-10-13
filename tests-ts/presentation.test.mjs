import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderSvg } from "../dist/core/src/index.js";
import { renderHtml } from "../dist/core/src/html.js";
import { STYLES } from "../dist/core/src/styles.js";
import { presentationColor } from "../dist/core/src/presentation.js";
const world = () =>
  JSON.parse(fs.readFileSync("examples/synthetic-world.json"));
test("grid uses unique actual tile edges, is optional, and leaves source data unchanged", () => {
  const w = world(),
    before = JSON.stringify(w);
  const svg = renderSvg(w);
  const grid = svg.match(/class="hex-grid"[^>]*d="([^"]+)"/)[1];
  const segments = grid
    .split("M ")
    .filter(Boolean)
    .map((s) => s.trim().split(" L ").sort().join("|"));
  assert.equal(new Set(segments).size, segments.length);
  assert.ok(segments.length > w.tiles.length * 2);
  assert.match(svg, /class="hex-grid" pointer-events="none"/);
  assert.doesNotMatch(renderSvg(w, { showHexGrid: false }), /class="hex-grid"/);
  assert.equal(JSON.stringify(w), before);
  assert.throws(() => renderSvg(w, { showHexGrid: "true" }), /must be boolean/);
});
test("known ice appears once in political and physical views, unknown features never become ice", () => {
  const w = world();
  w.tiles.forEach((t) => {
    t.feature = null;
    t.terrain = t.landWater === "water" ? "TERRAIN_OCEAN" : "TERRAIN_GRASS";
  });
  w.tiles.find((t) => t.landWater === "water").feature = "FEATURE_ICE";
  for (const mode of ["political", "physical"]) {
    const svg = renderSvg(w, {}, { mode });
    assert.equal((svg.match(/class="ice"/g) ?? []).length, 1);
  }
});
test("claimed water has the styled empire outline and a shared water fill", () => {
  const w = world();
  w.tiles.find((t) => t.landWater === "water").owner = 0;
  for (const [name, style] of Object.entries(STYLES)) {
    const svg = renderSvg(w, style);
    const path = svg.match(
      /<path data-owner="0" data-surface="water"[^>]+>/,
    )[0];
    assert.ok(
      path.includes(
        `stroke="${presentationColor(w.civilizations[0].color, name)}"`,
      ),
    );
    assert.ok(path.includes(`fill="${style.ownedWaterColor}"`));
  }
});
test("browser templates respect presets, palette and grid defaults across modes", () => {
  for (const [name, style] of Object.entries(STYLES)) {
    const html = renderHtml(world(), { css: "", js: "" }, style);
    assert.ok(html.includes(`"oceanColor":"${style.oceanColor}"`));
    const template = html.match(
      /<template id="map-political">([\s\S]*?)<\/template>/,
    )[1];
    assert.ok(template.includes('class="hex-grid"'));
    assert.ok(html.includes('"hexGrid":' + (name !== "minimalist")));
    if (name === "minimalist") assert.ok(html.includes('"roads":false'));
    assert.ok(
      template.includes(
        name === "atlas"
          ? "fill:#fffdf6"
          : name === "parchment"
            ? "fill:#392b20"
            : "fill:#243746",
      ),
    );
  }
});
