// Intentionally separate new presentation snapshots from the original parser oracle.
// Run only after reviewing a renderer change: npm run build && node scripts/update_render_snapshots.mjs
import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import * as p from "../dist/core/src/compat.js";
import { render_svg } from "../dist/core/src/render.js";
const fixtures = JSON.parse(
  gunzipSync(fs.readFileSync("tests-ts/fixtures/python-parity.json.gz")),
);
function decode(v) {
  if (v?.$bytes) return Uint8Array.from(Buffer.from(v.$bytes, "base64"));
  if (v?.$dict) return p.dict(v.$dict.map(([k, v]) => [decode(k), decode(v)]));
  if (v?.$set) return p.set(v.$set.map(decode));
  if (Array.isArray(v)) return v.map(decode);
  return v;
}
const snapshots = {};
for (const [i, f] of fixtures.entries())
  if (f.module === "render" && f.function === "render_svg" && !f.error)
    snapshots[i] = render_svg(...decode(f.args));
fs.writeFileSync(
  "tests-ts/fixtures/render-presentation.json.gz",
  gzipSync(JSON.stringify(snapshots)),
);
console.log(
  `Updated ${Object.keys(snapshots).length} presentation snapshots; parser oracle untouched.`,
);
