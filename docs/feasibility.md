# Save-to-map feasibility experiment

The first milestone is achieved for the tested formats: a real `.Civ5Save`
produces current-world JSON and a deterministic political map **without an
original `.Civ5Map`**. Required geography, ownership and current city records
are extracted. Optional game details remain explicitly unknown. Arbitrary
save compatibility is not established.

## Research and reuse

Investigated 2026-10-10. Implementations, format documentation and SDK
serialization source were inspected. Adapted layout code is attributed in
[NOTICE](../NOTICE), with its original MIT copyright and permission notice.

| Source | Relevant implementation | Reuse/license decision |
| --- | --- | --- |
| [js-civ5save](https://github.com/bmaupin/js-civ5save) | Setup/header settings; excludes compressed state | MIT; reference only, no current plot decoder to reuse |
| [rivarolle/civ5-saveparser](https://github.com/rivarolle/civ5-saveparser/tree/bb4e825d005a0e5c4e4903ba29c4691fa0c78fcf) | Older Python header/XML investigation | MIT; inspected, not incorporated |
| [jpl-labs/civ5-save-parser](https://github.com/jpl-labs/civ5-save-parser) | Turn/player/setup inspection and editing | License not established here; not incorporated |
| [Civ V SDK source mirror](https://github.com/Gedemon/Civ5-DLL) | CvMap/CvPlot/CvCity serialization routines | Format evidence only. SDK copyright is separate from MIT; no SDK source bundled |

Existing header/map parsing informed the experiment. The missing work was
current compressed plot/city extraction, so a small experimental reader
was added instead of translating the full upstream Go renderer or
adopting a framework. SDK layout evidence was cross-checked against actual
records; empirical modpack offsets have explicit profiles, not invented field
meanings. [NOTICE](../NOTICE) records attribution.

## Map files versus saves

The `.Civ5Map` format has a little-endian `.Civ5Map` header, terrain/feature/resource string tables
and eight-byte geography records, bottom row first. Scenario civilization
records and separate eight-byte improvement records associate owners/cities.
Scenario major/city-state encoding is **not** the save player-slot ID space.

A save has an uncompressed setup header, then framed compressed game state.
The header includes turn, mode, civilization/leader keys, roster slots and
settings. Strings are uint32-length-prefixed. The state includes game objects,
a small embedded SQLite database, map header, plots, areas/landmasses and
player/city objects. This experiment uses validated anchors for SQLite/map and
city records; it does not traverse every intervening game object.

Replay events alone lack base geography and are not substituted for
current ownership or current surviving cities. Historical events remain future
work. [CvMap](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvMap.cpp),
[CvPlot](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvPlot.cpp)
and [CvCity](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvCity.cpp)
serialization explain why the complete current world can reside in a save.

## Critical compression correction

Observed framing is `uint32 format`, followed by repeated
`uint32 compressedLength` + that many payload bytes. Payload chunks belong to
**one continuous zlib stream**; concatenate their bytes, removing **every**
length word, then inflate. Full chunks are 65,536 bytes, with a shorter final
chunk. Treating the initial length as a constant header and inflating the
remaining source bytes directly can silently corrupt output or raise zlib
errors. Early exploration did exactly that; all final artifacts use corrected
deframing. Tests explicitly cover multiple chunks and truncation.

Real saves lack the zlib termination marker, consistent with upstream format
notes. The reader accepts a clean sync-flushed stream, reports the missing
marker, bounds input/output to 64/128 MiB, and checks every chunk boundary.
A missing marker alone cannot distinguish a valid stream from all truncation.
Extraction additionally checks every plot coordinate, enums, variable arrays,
land/owner counts and all expected cities. Later game-state sections remain
unvalidated, so extraction does not certify the entire save's integrity.
Compression and SQLite anchors must be unique; ambiguity fails. Inspection can
retain partial metadata if map anchoring fails; full extraction cannot.

## Measured supplied-save results

Input: `AutoSave_Post_0132 AD-1420.Civ5Save`.

| Evidence | Result |
| --- | --- |
| SHA-256 | `715322dcda14203b605d0f82819829d4dc66595d4d8e6221601242f32133797e` |
| Setup header / build / mode | 8 / `1.0.3.279 (403694)` / multiplayer (1) |
| Turn | 132, setup and state agree |
| First compressed payload | Source byte 11,705; format 2 |
| Chunks / last length | 21 / 63,948 bytes |
| Correct decompressed size | **20,287,645 bytes** |
| Embedded SQLite | State byte 91,689; 3,072 bytes, empty SimpleValues table |
| Map header / first plot | State byte 94,761 / 95,731 |
| Dimensions / wrapping | 58 × 52; X true, Y false |
| Plot count / end | 3,016 / state byte 5,103,855 |
| Land | 1,095: 681 flatland, 376 hills, 38 mountains |
| Water / owned | 1,921 / 1,275 (including water) |
| Current cities | 56; plot references and game aggregate agree |
| Selected profile | observed-seven-yield |

These values come from state records, not filenames or preset dimensions.
Natural-wonder aggregate is 13. The SMALL preset is not used to infer actual
size. Saved custom civ keys include Kilwa/Vatican despite an empty mod array;
that array is insufficient to identify the complete ruleset.

## Supported extraction and largest uncertainties

Plot version 7 records use explicit profiles with variable script/build/unit/
archaeology tails. Each record must advance exactly to the next row-major
coordinate; a fixed-stride scan is insufficient. Owners are signed slot bytes
(-1 unowned), plot type supplies land/water/elevation, terrain is a signed ID,
and feature/resource types are hashes. Built-in feature hashes are recognized;
matching ruleset tables resolve mod types. Unknown hashes are preserved.

| Profile | Owner offset from record | Yields | City scalar count | City yield vectors | City padding after owners / before name |
| --- | --- | --- | --- | --- | --- |
| bnw-six-yield | 55 | 6 | 66 | 16 | 4 / 0 |
| observed-seven-yield | 57 | 7 | 58 | 18 | 0 / 5 |

Auto detection accepts exactly one profile that validates the whole grid.
The seven-yield profile is empirical for this local collection, **not** a
general decoder for every modded DLL. Unknown versions/layouts fail.

Each plot city reference identifies owner/local ID. After the map, a city
version-6 signature is searched and parsed through bounded scalars, boolean
flags, yield/domain/team vectors and its current name. Exactly one matching
record per reference is required. Coordinates and owner must match the plot;
city counts must match the game aggregate. This is narrower than traversing
all player city collections. Custom names are retained; localization keys are
resolved only from a supplied database. No replay city name is substituted.

| Requested data | Status without optional databases | With matching databases / remaining limit |
| --- | --- | --- |
| Dimensions, coordinates, wrapping | Extracted | Every coordinate checked; renderer supports horizontal wrap |
| Land/water and tile ownership | Extracted | Header aggregates reconciled, including owned water |
| Civilization IDs | Extracted player-slot references; overall metadata partial | Ruleset IDs retained; eliminated/unused status unresolved |
| Civilization names | Partial: type keys, minor keys | English labels resolve; multiplayer custom civ overrides unresolved |
| Cities and coordinates | Extracted current records | Readable localization names resolve; literal custom names retained |
| Terrain/deserts | Partial: raw IDs | Matching terrain table resolves names and validates water flag |
| Mountains/hills | Extracted plot type | Rendered mountain symbols; hills retained in JSON |
| Forests/features | Partial: recognized built-ins and raw hashes | Matching feature table resolves mod hashes; symbols for forest/jungle |
| Rivers | Extracted in supported plot profiles | Explicit SW/E/SE flags at bytes 45–47; exact SVG edges; independent in-game comparison still recommended |
| Capitals | Extracted in supported player profiles | Current owner/local ID joins validated city; unknown on optional validation failure |
| Physical roads / railroads | Partial: route IDs and pillage flags extracted | Matching Routes table supplies type; adjacency provides exact physical connections |
| Turn | Extracted | Setup/state cross-check |
| Civilization colors | Partial: saved color keys | Primary RGB from matching PlayerColors/Colors; style overrides separate |
| Historical ownership | Unavailable | Reuse upstream replay handling in a later experiment |
| Fog of war | Profile-based team arrays decoded | No independent in-game visibility comparison; renderer shows all tiles |
| Inland lakes / eliminated civs | Unavailable | Area/player state traversal required |

Database enrichment rejects roster-ID or terrain-water mismatches and reads
SQLite in read-only mode. It records hashes and preserves raw keys. Passing
those checks is useful evidence but cannot prove all mod definitions match.
Localized names and actual saved primary colors resolved for the supplied
save using copied local cache databases. City-state primary colors may be
black: optional style overrides can improve presentation without altering facts.

## Corpus and reproducibility

138 copied saves passed: 135 multiplayer autosaves using observed-seven-yield,
and three singleplayer saves using bnw-six-yield, at 58×52, 64×28 and 62×50.
The supplied save also passed separately. Multiplayer examples are strongly
correlated snapshots from one game, not 135 independent compatibility cases.
No real hotseat, vanilla pre-expansion, arbitrary custom DLL or other platform
corpus is certified. Source Windows files were only read and copied; SHA-256
comparison verifies local copies. Saves, databases, dumps and outputs stay in
ignored `artifacts/`, not distributed as open-source fixtures.

[README](../README.md) contains executable extraction/render/test commands.
`artifacts/corpus-report.json` records each file's hash, dimensions, mode,
profile, turn, decoded city count, capitals and route counts. 318 TypeScript tests pass, including native PNG/GIF integration and 312 synthetic comparison cases. In-memory fixtures exercise
chunk deframing, malformed data/limits, plot variable tails, full coordinates,
aggregate checks, city joins, metadata enrichment and renderer geometry.
The draft schema is validated against real and synthetic JSON. SVG is valid
XML; PNG is generated through Resvg WASM. Browser exports and CLI raster outputs are verified separately.
No screenshot or independent in-game export has been supplied; count/coordinate
checks establish strong internal consistency, not an independent visual proof.

## Minimal architecture and next experiments

Keep parser, normalized world and renderer separate. The TypeScript core uses bounded pako decompression and portable collection
helpers; optional read-only ruleset enrichment uses sql.js. Resvg WASM PNG
conversion and gifenc export remain separate adapters. Exact hex edge unions create land polygons with
holes/islands; coastline/border strokes retain topology. Stable labels use a
largest-component centroid tile and approximate collision boxes. Polylabel,
seam-aware label placement, smoothing and high-quality typography remain
refinements after independent state validation.

1. Compare generated JSON against an in-game Lua export for known ownership,
   capitals, rivers, renamed/captured/razed cities and team visibility.
2. Traverse player/area objects for elimination, custom civ names and lakes.
3. Add independent games/versions and transfer/raze cases to the private corpus;
   document each profile's evidence before expanding compatibility claims.
4. Improve labels and introduce conservative border simplification only after
   geography is independently verified. Never let style alter source positions.
5. Extend browser-only replay exploration and decoration after validating the
   current save/replay fields. A save upload backend is unnecessary.

If binary compatibility becomes impractical, a matching in-game Lua/mod export
can supply exact state after loading the save. That fallback needs the game
and correct mods, so cannot claim standalone arbitrary uploads. Map+replay
reconstruction has weaker current-state guarantees and must be labeled separately.
No AI-generated geography, UI framework or animation is part of this experiment.

## Follow-up: multiplayer names and city-state alliances

The turn-132 save contains four display nicknames, which are now exposed as
`playerName` after removing network account suffixes. These are taken from
setup slot hints and may persist after AI takeover. They are not substitutes
for custom civilization names. Export can omit them; inspection still omits
names by default. The renderer chooses player labels or civilization labels
through a style option, preserving both data fields.

All 12 city-state roster entries in the supplied save have validated current
alliance records; eight currently store a major ally. Allied owners are
24→4, 26→2, 27→5, 28→5, 30→3, 31→4, 32→2, 33→3. These are actual stored ally
IDs, not inferred from influence. Captured city-state cities keep their current
major ownership and are not treated as allied city-state territory.

A new optional reader anchors all 64 ordered player identities through fixed
boolean fields and ten yield vectors, verifies current city records lie in the
correct player intervals, and finds exactly one MinorCivAI version-1 record in
each city-state's interval. It validates the enum/counter header, fixed 22×22
enemy matrix, boolean arrays, 22-major influence/counter arrays, all per-major
quest records, notification flag and following DealAI version boundary.
The serialized `m_eAlly` directly supplies the relationship. It does not infer
allies by influence rankings or bake in a friendship threshold.

Vanilla BNW has no extra arrays in this record. The seven-yield collection has
two 63-slot bullying arrays and a 22-slot last-ally-turn array before influence,
matching conditional fields documented in
[Lekmod's MinorCivAI source](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvMinorCivAI.cpp)
and [declarations](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvMinorCivAI.h).
This is an explicit supported profile: newer builds with additional conditional
fields may remain unknown. Missing/ambiguous relationships are reported and
left uncolored; geography extraction remains usable. Player traversal remains
anchored, not a complete sequential decoder, and independent in-game alliance
validation is still a recommended next experiment. No external source code
from these game serialization implementations is bundled.

The follow-up corpus run decoded city-state alliance status for all 138 copied
saves, including the three singleplayer examples. The turn-132 output renders
337 owned water tiles in a shared teal fill, against dark-blue unowned water;
all 38 known mountain tiles have larger outlined icons. Tests verify optional
alliance ambiguity remains unknown, allies follow the stored reference even
when another player's influence is higher, rendering leaves owners/borders
unchanged, and claimed-water/icon layers use actual classified tile records.

## Follow-up: current capitals and physical routes

Current capital IDs are read from empirical version-16 player prefixes anchored
to the already validated player identities. The six-yield profile starts 908
bytes before the identity and reads the capital ID 257 bytes before it; the
seven-yield profile uses 1,050 and 262 bytes. These offsets describe the tested
layouts, not universal vanilla/mod compatibility. Prefix population and land
must match current cities/plots; neighboring tail coordinates, turn and boolean
fields corroborate alignment. The current owner/local ID must uniquely join a
current city. Original capital coordinates and founding order never select it.
Dead city-states retaining stale IDs have no current capital. Optional failures
leave capital status unknown without replacing valid geography.

The distinction between current capital ID and original coordinates is supported
by [SDK player serialization](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvPlayer.cpp)
and [Lekmod player serialization](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvPlayer.cpp).
The latter also illustrates conditional fields that can change offsets.
All 138 copied saves decoded capital status, with zero unknown city flags.
The supplied turn-132 save contains 15 current capitals: six major empires and
nine city-states. Gold vector stars and bold labels distinguish them.

Plot route-pillage flags are at byte 50 in both supported profiles, and signed
route IDs at owner-offset + 23, corroborated by
[SDK plot serialization](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvPlot.cpp).
The matching ruleset resolves route IDs without assuming a mod's enum ordering.
The supplied save contains 231 route tiles, including 56 city tiles, with four
pillaged tiles. It resolves exclusively to roads. The SVG draws 297 adjacent
connections, 15 incident to pillaged tiles, and handles seam crossings without
long lines across the map. Pillaged sections are dashed red; railroad styling
is covered by synthetic tests but not demonstrated in this real save.
These are physical infrastructure connections, not a reconstructed economic
trade network. No straight lines are invented between disconnected cities.
Tests cover relocated/current capital references, stale/cross-owner IDs,
unknown records, route flags, odd-row adjacency, wrapping, railroads, pillage,
style toggles and marker projection. Independent in-game comparison remains
the next step for validation beyond internal record consistency.

## Replay CLI and river follow-up

Replay parsing/GIF rendering and unknown-save diagnostics are documented in
[docs/replays.md](replays.md). The TypeScript GIF adapter uses Resvg WASM and gifenc with the
same SVG renderer. It supports standalone replay version 1,
standard and observed extended messages, save state version 1 messages, map
versions 11/12 and upstream/normalized JSON base maps. No new full-world save
profile is claimed. Three older standalone replay files remain unsupported.

River booleans at bytes 45–47 correspond to `m_bNEOfRiver`, `m_bWOfRiver`,
`m_bNWOfRiver`, i.e. SW/E/SE edges, corroborated by the plot serializer and setters.
The supplied save has 121 SW, 142 E and 172 SE edges (435 total); their presence
exactly matches the corresponding non-sentinel flow direction across all 3,016
tiles. Extraction uses the booleans directly, independently of flow enums.
Both supported profiles validate boolean values. Rivers now render along exact
hex boundaries. The larger gold capitals and single purple city-state city
labels address readability without changing geography or ownership.


## Current unit extraction

The optional unit reader uses the existing validated plot grid: each serialized
plot unit reference stores `(owner, localId)` as two int32 values, as shown by
[SDK CvPlot serialization](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvPlot.cpp).
Unit prefixes follow declaration order in
[SDK CvUnit.h](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvUnit.h),
which differs from constructor initializer-list order. Version 9 precedes six
int32 values: owner, original owner, runtime unit type, x, y, local ID. Every
candidate must match its exact plot reference and lie within its validated
player interval. Duplicate references or non-unique unit candidates fail.

The reader supports two explicit empirical archive profiles:

| Existing save profile | Unit version | Archive strings offset from unit start |
| --- | --- | --- |
| bnw-six-yield | 9 | 507 |
| observed-seven-yield | 9 | 931 |

Uninterpreted archive bytes are skipped without assigning meanings. The two
strings and ten bounded int32 vectors must parse; repeated terrain/feature
vector dimensions must agree. Six final archive scalars lead to the serialized
unit type hash. Version-1 promotions must follow, with bounded capacities and
unique active hash/true pairs. Validation stops after these promotion records,
not at an invented complete-unit boundary. The layout is corroborated by
[SDK CvUnit serialization](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvUnit.cpp)
and
[SDK promotion serialization](https://github.com/Gedemon/Civ5-DLL/blob/master/CvGameCoreDLL_Expansion2/CvPromotionClasses.cpp).
Current [Lekmod source](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvUnit.cpp)
writes unit version 10 and conditional archive fields; that layout is **not**
claimed as supported. Unknown profiles/versions fail for optional unit extraction.

Matching ruleset enrichment resolves the serialized unit hash independently of
its runtime index, which can change. Combat/RangedCombat values above zero and
nonnegative NukeDamageLevel identify military types; no health, experience,
readiness or current attack strength is inferred. The army renderer excludes
city-state/barbarian forces and noncombat civilians, while retaining them in
optional normalized unit data. Units can stand on unowned or foreign tiles.

The supplied turn-132 save has 497 plot-referenced units and the turn-91
multiplayer save has 241. All references uniquely match validated version-9
records. The three six-yield singleplayer samples also pass (76, 336 and 148
units). `scripts/validate_units.mjs` checks the entire copied corpus and optionally
all type hashes against a matching ruleset; its report is stored locally under
`artifacts/unit-corpus-report.json`.

The full copied corpus contains 138 saves. With the available multiplayer
ruleset, 136 pass unit extraction and enrichment. The Alexander and Catherine
singleplayer samples pass unit extraction, but enrichment rejects civilization
ID mismatches (`CIVILIZATION_SWISS` and `CIVILIZATION_FINNS`); their own matching
ruleset databases are required. These are ruleset mismatches, not newly supported
unit layouts. The tool does not reuse multiplayer unit names for these saves.

Coverage is current physical plot references. Off-map/trade-manager objects
are not traversed; historical unit positions are absent from the replay
reconstruction. Army mode is therefore current-save/JSON only. Physical replay
mode can use resolved geography from a matching map/world JSON; it represents
the recorded geography snapshot rather than historical terrain changes.

Detailed military symbols add no binary compatibility claim: optional ruleset
`Units.CombatClass` and `Units.Class` columns are joined by the already validated
unit type hash. Known combat keys select presentation categories; exact
`UNITCLASS_AIRSHIP` distinguishes the local ruleset's airship from its shared
helicopter combat class. Missing/custom classes retain generic domain symbols.
The military summary uses the same filtered unit set as map markers. In the
turn-132 example, 328 major-empire military units produce totals
26, 11, 105, 38, 33 and 115 across six current empires. Known inactive roster
slots without units are omitted using explicit alive/eliminated evidence;
unknown activity is retained. These are unit counts, not strength or readiness.


## TypeScript browser migration

The format evidence and supported profiles above are unchanged. The current
implementation lives in `packages/core/src`, with shared Node CLI and static
browser clients. Python and its upload server were retired after synthetic and
real-file comparisons. [Migration validation](typescript-migration.md) records
the compatibility audit; [browser hosting](browser.md) describes session-local
save/database loading. This does not establish compatibility with new DLLs.
