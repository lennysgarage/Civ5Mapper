import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import * as p from "../dist/core/src/compat.js";
const fixtures = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      new URL("./fixtures/python-parity.json.gz", import.meta.url),
    ),
  ),
);
const modules = Object.fromEntries(
  await Promise.all(
    [...new Set(fixtures.map((f) => f.module))].map(async (m) => [
      m,
      await import(`../dist/core/src/${m}.js`),
    ]),
  ),
);
function decode(v) {
  if (v?.$bytes) return Uint8Array.from(Buffer.from(v.$bytes, "base64"));
  if (v?.$dict) return p.dict(v.$dict.map(([k, v]) => [decode(k), decode(v)]));
  if (v?.$set) return p.set(v.$set.map(decode));
  if (Array.isArray(v)) return v.map(decode);
  return v;
}
function output(v) {
  if (v === undefined) return null;
  if (v instanceof p.Dictionary)
    return { $dict: [...v].map(([k, v]) => [output(k), output(v)]) };
  if (v instanceof Uint8Array)
    return { $bytes: Buffer.from(v).toString("base64") };
  if (v instanceof Set) return { $set: [...v].sort(p.compare).map(output) };
  if (Array.isArray(v)) return v.map(output);
  return v;
}
function canonical(v) {
  if (v?.$dict)
    return {
      $dict: v.$dict
        .map(([k, v]) => [canonical(k), canonical(v)])
        .sort(([a], [b]) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    };
  if (Array.isArray(v)) return v.map(canonical);
  return v;
}
for (const [i, fixture] of fixtures.entries())
  test(`${i}: ${fixture.test} / ${fixture.module}.${fixture.function}`, () => {
    const fn = modules[fixture.module][fixture.function];
    assert.equal(typeof fn, "function");
    const args = decode(fixture.args);
    if (fixture.error) {
      assert.throws(() => fn(...args), { message: fixture.error });
      return;
    }
    const actual = fn(...args);
    // This legacy Python oracle predates optional territory assignments.
    // Their decoding and failure behavior have dedicated religion tests.
    if (
      fixture.module === "extract" &&
      fixture.function === "read_plots" &&
      !fixture.error
    )
      for (const tile of actual[0]) {
        tile.delete("territoryCityKnown");
        tile.delete("territoryCityReference");
      }
    assert.deepEqual(canonical(output(actual)), canonical(fixture.expected));
    assert.deepEqual(
      canonical(output(args)),
      canonical(fixture.afterArgs ?? fixture.args),
    );
  });
