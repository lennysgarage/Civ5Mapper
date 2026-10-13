# Default browser metadata

These compact SQLite databases provide the lookup values previously loaded from
the local Lekmod caches by the Python workflow. The browser loads them on demand;
matching user-selected databases take precedence. They are read-only inputs.

`ruleset.db` contains only the columns used by `ruleset.ts` from Civilizations,
MinorCivilizations, Terrains, Features, Routes, PlayerColors, Colors and Units.
`localization.db` contains English names referenced by those tables and
Civilization_CityNames, plus city/city-state name tags. It preserves conflicting
rows so the parser can leave ambiguous names unresolved. No save state or game
graphics are present.

`manifest.json` records source/output SHA-256 hashes and row counts. The precise
Lekmod release of the supplied caches is unknown; these values have been checked
against the existing local save corpus. A mismatch prompts users to select their
matching caches. Rebuild from source caches with:

```sh
node scripts/prepare_browser_databases.mjs ruleset-source.db localization-source.db
```

See [NOTICE](../../NOTICE) for provenance and ownership.
