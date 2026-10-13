// Produce small, read-only metadata databases without save state or game assets.
// node scripts/prepare_browser_databases.mjs ruleset.db localization.db [output]
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";

const [rulesetPath, localizationPath, output = "assets/databases"] =
  process.argv.slice(2);
if (!rulesetPath || !localizationPath)
  throw new Error(
    "Supply Civ5DebugDatabase.db and Localization-Merged.db paths",
  );
const SQL = await initSqlJs();
const digest = (data) => createHash("sha256").update(data).digest("hex");
const tables = {
  Civilizations: ["ID", "Type", "Description"],
  MinorCivilizations: ["Type", "Description"],
  Terrains: ["ID", "Type", "Water"],
  Features: ["Type"],
  Routes: ["ID", "Type"],
  PlayerColors: ["Type", "PrimaryColor"],
  Colors: ["Type", "Red", "Green", "Blue"],
  Units: [
    "Type",
    "Description",
    "Domain",
    "Combat",
    "RangedCombat",
    "NukeDamageLevel",
    "CombatClass",
    "Class",
  ],
};
const nameKeys = new Set();
const lookupSource = new SQL.Database(await fs.readFile(rulesetPath));
try {
  for (const [table, column] of [
    ["Civilizations", "Description"],
    ["MinorCivilizations", "Description"],
    ["Units", "Description"],
    ["Civilization_CityNames", "CityName"],
  ]) {
    const result = lookupSource.exec(`SELECT "${column}" FROM "${table}"`)[0];
    for (const [key] of result?.values ?? []) if (key) nameKeys.add(key);
  }
} finally {
  lookupSource.close();
}
await fs.mkdir(output, { recursive: true });
const manifest = {
  name: "Default Lekmod metadata",
  description:
    "Lookup values and English names from the caches validated with the local save corpus. Exact Lekmod release is unknown; identity mismatches are rejected.",
  files: {},
};
for (const [kind, input, selected] of [
  ["ruleset", rulesetPath, tables],
  ["localization", localizationPath, { Language_en_US: ["Tag", "Text"] }],
]) {
  const sourceBytes = await fs.readFile(input);
  const source = new SQL.Database(sourceBytes),
    target = new SQL.Database();
  const counts = {};
  try {
    target.run("BEGIN");
    for (const [table, columns] of Object.entries(selected)) {
      const available = new Set(
        source.exec(`PRAGMA table_info(${table})`)[0]?.values.map((r) => r[1]),
      );
      const result = source.exec(
        `SELECT ${columns.map((c) => (available.has(c) ? `"${c}"` : `NULL AS "${c}"`)).join(",")} FROM "${table}"`,
      )[0];
      if (!result) throw new Error(`Missing metadata table ${table}`);
      if (table === "Language_en_US")
        result.values = result.values.filter(
          ([tag]) =>
            nameKeys.has(tag) || /^TXT_KEY_CITY(?:_NAME_|STATE_)/.test(tag),
        );
      target.run(
        `CREATE TABLE "${table}" (${columns.map((c) => `"${c}"`).join(",")})`,
      );
      const insert = target.prepare(
        `INSERT INTO "${table}" VALUES (${columns.map(() => "?").join(",")})`,
      );
      try {
        for (const row of result.values) insert.run(row);
      } finally {
        insert.free();
      }
      const indexed = columns.includes("Tag") ? "Tag" : "Type";
      target.run(`CREATE INDEX "${table}_lookup" ON "${table}" ("${indexed}")`);
      counts[table] = result.values.length;
    }
    target.run("COMMIT");
    const data = target.export(),
      filename = `${kind}.db`;
    await fs.writeFile(path.join(output, filename), data);
    manifest.files[kind] = {
      filename,
      bytes: data.length,
      sha256: digest(data),
      sourceSha256: digest(sourceBytes),
      rows: counts,
    };
    process.stdout.write(`${filename}: ${data.length} bytes\n`);
  } finally {
    source.close();
    target.close();
  }
}
await fs.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
