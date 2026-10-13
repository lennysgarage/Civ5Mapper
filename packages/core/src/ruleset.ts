import initSqlJs from "sql.js";
import type { SqlJsStatic, Database } from "sql.js";
import { ParseError, crc32, sha256, round } from "./compat.js";
import type { World } from "./index.js";
let SQL: SqlJsStatic;
export async function initRuleset(wasm: Uint8Array) {
  SQL ??= await initSqlJs({ wasmBinary: wasm.slice().buffer as ArrayBuffer });
}
export interface Databases {
  ruleset?: Uint8Array;
  localization?: Uint8Array;
}
const typeHash = (key: string) =>
  ((crc32(new TextEncoder().encode(key)) ^ 0xffffffff) >>> 0)
    .toString(16)
    .padStart(8, "0");
function rows(db: Database, sql: string, params: any[] = []): any {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.get());
    return result;
  } finally {
    statement.free();
  }
}
export function enrichWorld(input: World, files: Databases): World {
  if (!SQL) throw new ParseError("SQLite runtime has not been initialized");
  const world = structuredClone(input),
    evidence: any = {};
  if (files.ruleset) {
    const db = new SQL.Database(files.ruleset);
    try {
      for (const civ of world.civilizations) {
        const row = rows(db, "SELECT ID FROM Civilizations WHERE Type=?", [
          civ.key,
        ])[0];
        if (!row || row[0] !== civ.rulesetId)
          throw new ParseError(`ruleset civilization ID mismatch: ${civ.key}`);
      }
      const terrains = new Map(rows(db, "SELECT ID,Type FROM Terrains")),
        water = new Map(rows(db, "SELECT ID,Water FROM Terrains"));
      const routeTypes = world.tiles.some((t) => t.routeKnown)
        ? new Map(rows(db, "SELECT ID,Type FROM Routes"))
        : new Map();
      const features = new Map();
      for (const [key] of rows(db, "SELECT Type FROM Features")) {
        const hash = typeHash(key);
        if (features.has(hash) && features.get(hash) !== key)
          throw new ParseError("feature hash collision in ruleset");
        features.set(hash, key);
      }
      for (const t of world.tiles) {
        if (
          !terrains.has(t.terrainId) ||
          Boolean(water.get(t.terrainId)) !== (t.landWater === "water")
        )
          throw new ParseError(`ruleset terrain mismatch at (${t.x}, ${t.y})`);
        t.terrain = terrains.get(t.terrainId);
        if (t.routeKnown && t.routeId !== null) {
          if (!routeTypes.has(t.routeId))
            throw new ParseError(`ruleset route mismatch at (${t.x}, ${t.y})`);
          t.route = routeTypes.get(t.routeId);
        }
        if (t.featureHash && features.has(t.featureHash))
          t.feature = features.get(t.featureHash);
      }
      for (const civ of world.civilizations) {
        const row = civ.minorKey
          ? rows(
              db,
              "SELECT Description FROM MinorCivilizations WHERE Type=?",
              [civ.minorKey],
            )[0]
          : rows(db, "SELECT Description FROM Civilizations WHERE Type=?", [
              civ.key,
            ])[0];
        if (row) civ.nameKey = row[0];
        if (civ.colorKey) {
          const color = rows(
            db,
            "SELECT c.Red,c.Green,c.Blue FROM PlayerColors p JOIN Colors c ON c.Type=p.PrimaryColor WHERE p.Type=?",
            [civ.colorKey],
          )[0];
          if (color) {
            if (color.some((c) => c < 0 || c > 1))
              throw new ParseError("invalid ruleset color component");
            civ.color =
              "#" +
              color
                .map((c) =>
                  round(c * 255)
                    .toString(16)
                    .padStart(2, "0")
                    .toUpperCase(),
                )
                .join("");
          }
        }
      }
      if (world.units) {
        const columns = new Set(
          rows(db, "PRAGMA table_info(Units)").map((r) => r[1]),
        );
        const types = new Map();
        for (const row of rows(
          db,
          `SELECT Type,Description,Domain,Combat,RangedCombat,NukeDamageLevel,${columns.has("CombatClass") ? "CombatClass" : "NULL"},${columns.has("Class") ? "Class" : "NULL"} FROM Units`,
        )) {
          const hash = typeHash(row[0]);
          if (types.has(hash))
            throw new ParseError("unit type hash collision in ruleset");
          types.set(hash, row);
        }
        for (const unit of world.units) {
          const r = types.get(unit.unitTypeHash);
          if (!r)
            throw new ParseError(`ruleset unit hash mismatch: ${unit.id}`);
          const [
            key,
            name,
            domain,
            combat,
            ranged,
            nuclear,
            combatClass,
            unitClass,
          ] = r;
          if (
            typeof domain !== "string" ||
            !domain.startsWith("DOMAIN_") ||
            [combat, ranged, nuclear].some((v) => typeof v !== "number")
          )
            throw new ParseError("invalid ruleset military unit metadata");
          if (
            (combatClass !== null && typeof combatClass !== "string") ||
            (unitClass !== null && typeof unitClass !== "string")
          )
            throw new ParseError("invalid ruleset unit class metadata");
          Object.assign(unit, {
            type: key,
            name: key,
            nameKey: name,
            domain,
            isMilitary: combat > 0 || ranged > 0 || nuclear >= 0,
            classificationKnown: true,
            combatClass,
            unitClass,
          });
        }
        Object.assign(world.extraction.fields, {
          unitTypes: "extracted",
          militaryClassification: "extracted",
        });
      }
      if (world.culture)
        world.extraction.fields.cultureThresholds = "unavailable";
      if (
        world.culture &&
        rows(
          db,
          "SELECT name FROM sqlite_master WHERE type='table' AND name='Defines'",
        ).length
      ) {
        const names = [
          "EXOTIC",
          "FAMILIAR",
          "POPULAR",
          "INFLUENTIAL",
          "DOMINANT",
        ];
        const values = names.map(
          (name) =>
            rows(db, "SELECT Value FROM Defines WHERE Name=?", [
              "CULTURE_LEVEL_" + name,
            ])[0]?.[0],
        );
        if (
          values.every(
            (n, i) =>
              Number.isSafeInteger(n) &&
              n >= 0 &&
              (i === 0 || n > values[i - 1]),
          )
        ) {
          world.culture.thresholds = {
            values,
            source: "ruleset-database",
            databaseSha256: sha256(files.ruleset).hexdigest(),
          };
          world.extraction.fields.cultureThresholds = "extracted";
        } else {
          world.extraction.fields.cultureThresholds = "unavailable";
          world.extraction.warnings.push(
            "Influence tiers unavailable: matching culture thresholds are incomplete or invalid.",
          );
        }
      }
      world.extraction.fields.terrain = "extracted";
      world.extraction.fields.features = world.tiles.every(
        (t) => "feature" in t,
      )
        ? "extracted"
        : "partial";
      if (routeTypes.size) world.extraction.fields.routes = "extracted";
      world.extraction.fields.civilizationColors = world.civilizations.every(
        (c) => c.color,
      )
        ? "extracted"
        : "partial";
    } finally {
      db.close();
    }
    evidence.databaseSha256 = sha256(files.ruleset).hexdigest();
  }
  if (files.localization) {
    const db = new SQL.Database(files.localization);
    try {
      for (const object of [
        ...world.civilizations,
        ...world.cities,
        ...(world.units ?? []),
      ])
        if (object.nameKey) {
          const values = new Set(
            rows(db, "SELECT Text FROM Language_en_US WHERE Tag=?", [
              object.nameKey,
            ])
              .map((r) => r[0])
              .filter(Boolean),
          );
          if (values.size === 1) {
            object.name = [...values][0];
            object.nameSource = "localization-database";
          }
        }
    } finally {
      db.close();
    }
    evidence.localizationSha256 = sha256(files.localization).hexdigest();
  }
  world.source.ruleset = evidence;
  return world;
}
