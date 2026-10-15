# Default browser metadata

These compact SQLite databases provide the lookup values previously loaded from
the local Lekmod caches by the Python workflow. The browser loads them on demand;
matching user-selected databases take precedence. They are read-only inputs.

`ruleset.db` contains only the columns used by `ruleset.ts` from Civilizations,
MinorCivilizations, Religions, Terrains, Features, Routes, PlayerColors, Colors and Units, plus only the five `CULTURE_LEVEL_*` rows in Defines used by
the tourism influence view. Culture thresholds do not establish team contact.
Feature metadata includes natural-wonder flags and description keys; it is
matched by saved feature hash. `localization.db` contains English names referenced by those tables and
Civilization_CityNames, plus city/city-state name tags. It preserves conflicting
rows so the parser can leave ambiguous names unresolved. No save state or game
graphics are present.

`manifest.json` records source/output SHA-256 hashes and row counts. The precise
Lekmod release of the supplied caches is unknown; these values have been checked
against the existing local save corpus. A mismatch prompts users to select their
matching caches.

Religion labels use the bundled ruleset's numeric IDs. Matching mod databases
take precedence; saved custom religion names may remain unknown.

`eight-yield/` contains a separate compact set from the newer local Lekmod
caches, validated against the turn-157 singleplayer save using Lekmap v6.3.
The browser selects it for `observed-eight-yield` saves. Older six- and
seven-yield saves continue to use the original set. The layout name describes
the serialized yield count, not a claimed Lekmod release number; civilization
identities are still checked before metadata is applied.

Rebuild from source caches with:

```sh
node scripts/prepare_browser_databases.mjs ruleset-source.db localization-source.db
```

See [NOTICE](../../NOTICE) for provenance and ownership.
