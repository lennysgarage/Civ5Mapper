# Normalized world contract (experimental 0.1)

The [draft 2020-12 schema](../schemas/world.schema.json) separates binary parsing
from rendering. Additional fields are permitted for diagnostics and extensions.
`extraction.status: complete` means the core world is renderable: dimensions,
all coordinates, land/water, ownership, civilization references and current
cities are known. It does **not** mean every optional game field is understood.
`extraction.fields` explicitly records extracted/partial/unavailable status.
A partial inspection has `tiles: null, cities: null` and is rejected by rendering.

`source.kind` is save/map/game-export/synthetic. Save output records input SHA-256;
optional metadata enrichment records database hashes. Synthetic provenance is
preserved in the SVG title and visible banner. No missing save records are
filled from synthetic examples.

Coordinates are pointy hexes, `odd-r-bottom-up`: x increases east, y north,
row zero is south, odd rows shift half a hex east. Rendering flips y. East/west
neighbors are x±1. For both adjacent rows y±1, even-row neighbors are x-1 and x;
odd-row neighbors are x and x+1. X wraps modulo width only if wrapX is true.
The save reader verifies every serialized x/y against row-major ordering.
JSON tile array order is immaterial. Exactly width × height unique coordinates
must exist. The SVG displays a rectangular cut of a cylinder; seam boundaries
are paired, and local polygons are cut at the seam. Vertical wrapping is
represented but rejected by the current renderer.

Civilization `id` is the player slot, not the ruleset civilization ID or replay
index. `rulesetId` and raw `key`/`leaderKey` remain separate. Every owner must
reference a roster entry. City-states use the same owner ID space and retain
`minorKey` when decoded. Unused/observer slots may occur in the roster;
`eliminated: null` means unknown, never alive. Multiplayer custom civilization
name overrides are not decoded. Mod type keys are preserved unchanged.

Optional `civilizations[].turnOneSlotStatus` records the raw slot status from a
supplied matching turn-1 save; null/absence means unknown. This optional historical
evidence does not override HTML grouping, which defaults to current human status
or a retained player name (including lobby-only names). `game.turnOnePlayerEvidence` records turn,
reference save hash, geography hash and matching checks. `--turn-one-save` on
extract/render/render-save validates exact geography and major civilization
slots before adding these fields, and never overwrites current slot status.
`extraction.fields.turnOnePlayerGroups` is extracted/partial according to the
major roster's known 1/3 statuses. Additive metadata keeps schema version 0.1.

A known unowned tile is `owner: null, ownershipKnown: true`. Unknown ownership
has `ownershipKnown: false`, and cannot be rendered as a complete world.
`landWater` is land/water; `elevation` is flat/hills/mountain or null. Numeric
`terrainId` is ruleset-specific; `terrain` remains null until a matching database
resolves it. Known feature hashes may resolve without a database; unresolved
features omit `feature` and retain `featureHash`. Explicit `feature: null` means
known absent. `resourceHash` is raw evidence, not a guessed resource name.

`riverEdges: null` is unknown; `[]` is known absent. Future known edges use E/SE/SW
with north increasing y. `riverFlowDirections` retains serialized signed enums
without establishing river presence. `isLake: null` is unknown; water fills
distinguish ownership, not lakes. `visibility` maps team IDs (not player IDs) to
visible/revealed/unrevealed/unknown. Save extraction exposes all world plots,
not only the local player's explored area; the renderer does not apply fog.
Visibility decoding follows the profile layout and has no independent in-game
cross-check yet. Missing visibility never implies revealed.

Cities use `id: "owner:localId"`, coordinates, current owner, current name or
literal localization key, population and `capital`. `nameKey` preserves the
stored localization identifier; a matching localization database may populate
readable `name` and `nameSource`. Literal custom city names are preserved.
`capital: null` is unknown and renders as an ordinary marker. A star requires
explicit true. Founding order and historical capital flags are not evidence
of current capital status.

`civilizations[].capitalKnown: true` means the current player reference was
validated. `capitalCityId` joins an owned city ID, or is null when no current
capital exists. False means unknown, not absent. `capitalEvidence` retains
binary boundaries and the raw local ID. Dead players can retain stale IDs;
these never mark a conqueror's city. Known references and city flags must agree.
Gold vector stars mark explicit current capitals, including city-state capitals.

Tiles have `routeKnown`, nullable numeric `routeId`, nullable resolved `route`
and boolean `routePillaged`. Known with null ID means no physical route;
unknown must not be interpreted as absent. IDs are ruleset-specific: only a
matching database supplies names such as ROUTE_ROAD or ROUTE_RAILROAD. A present
unresolved ID remains usable for generic infrastructure geometry. Connections
join adjacent known route tiles using the same odd-row coordinates, split at
the horizontal seam. A connection incident to a pillaged tile is dashed red.
Routes can cross ownership boundaries. They do not assert functional trade
connections, movement permissions, harbor connections or unbuilt roads.

Civilization names/colors can be null. `colorKey` is the saved player-color key;
optional matching database enrichment resolves its primary RGB color to hex.
Fallback palettes and `colorOverrides` belong exclusively to styling and never
change JSON facts. Fields marked partial can contain valid data for some entries.

`inspection` holds parser-specific offsets, map aggregates, profile and record
boundaries. Compression offsets refer to source-file bytes; map/city offsets
refer to deframed decompressed bytes. City `evidence` identifies its anchored
record and name boundary. Unknown collections use null; known empty collections
use []. Consumers should retain unknown optional fields on round trips.

The renderer performs cross-record checks that JSON Schema cannot express:
full coordinate coverage, unique civilization IDs, valid owners and city/tile
consistency. It validates colors and escapes labels. Deterministic output uses
sorted coordinates and stable label priorities. Exact polygon edge unions
preserve holes and islands; no smoothing, simplification or polylabel is used.
Collision boxes estimate text width; fonts and PNG text rasterization can vary
between systems. Crowded labels may be omitted, but city markers remain.

## Player labels and city-state alliances

`civilizations[].playerName` is an optional saved display nickname, separate
from the civilization's `name`. Account suffixes are stripped with the game
rule; raw network nicknames/account IDs are not retained. It can reflect a
previous human occupant after AI takeover; it is not a current-human flag.
The extractor includes it for multiplayer/hotseat saves unless
`--no-player-names` is supplied. Plain inspection remains name-free.

City-states may contain `ally` (major player-slot ID or null), `allianceKnown`
and `allianceSinceTurn`. `ally: null, allianceKnown: true` means a decoded
unallied state; false means unknown. An ally is the stored **current** MinorCivAI
reference, not the largest influence value, historical ally or nearby empire.
`allianceEvidence` records validated binary boundaries. Unsupported/ambiguous
optional records leave relationships unknown without fabricating data or
preventing otherwise valid geography extraction.

Default rendering uses a major's playerName when available, and shades known
allied city-states by mixing the major's rendered color with 35% white. Thus
major color overrides also propagate to allies; explicit city-state overrides
win. This changes presentation only. Country names, city-state names, owners,
borders and positions remain separate facts. `empireLabels` (player/civilization),
`shadeAlliedCityStates` (boolean) and `allyShade` (0.05–0.85) control this behavior.
SVG territory titles identify relationships; its legend explains shading.

City-states omit territory-name labels and keep one city label at the decoded
city position, tinted with `cityStateLabelColor`. Capital markers are larger
gold circular badges for empires and purple diamond badges for city-states
(`capitalSize`, default 12); unknown capital status stays an
ordinary city marker. River strokes use explicit E/SE/SW presence edges along
the exact hex boundary, with paired seam strokes. `showRivers`, `riverColor`
and `riverWidth` control presentation. Unknown edges are never inferred from
flow directions. The supported save profiles now decode presence flags at
record bytes 45–47 (SW, E, SE). Replay and map readers normalize their distinct
river bit assignments into the same edge names.

Claimed water rendering uses actual `landWater: water` and non-null `owner`:
`ownedWaterColor` is one shared presentation color, distinct from `oceanColor`
for unowned water. `showOwnedWater` controls this layer; it does not change
ownership or distinguish still-unknown lakes. Owned water polygons are grouped
by owner and retain shared ownership boundary strokes even when fills match.
`mountainSize` (6–30, default 16) controls two-tone vector mountain icons placed
only where `elevation: mountain` is known. Light icon peaks are decorative
cartography, not an additional snow/terrain assertion.

Unclaimed land (known null owner) defaults to pale cream with a diagonal hatch.
`showUnownedPattern` toggles it; `unownedColor` controls its background. The hatch
is never applied to owned land or water. Capital badge shapes follow decoded
owner kind, while capital status still requires explicit true.

## Optional current units and rendering modes

Schema version remains 0.1: `units` is an additive optional array. Missing or
null means not extracted; `[]` means no current plot-referenced units. Extract
it with `extract --units`, or use `render-save --mode army`.

Each unit has `id` (`owner:localId`), `localId`, `owner`, `x`, `y`, raw
`unitTypeId`, and serialized `unitTypeHash`. Coordinates use the same grid as
tiles, but a unit's owner need not own its tile, and land units can occupy water
when embarked. IDs are unique across the array. Units are sorted by owner and
local ID. `evidence` records the validated unit prefix, archive hash and
promotion boundaries; it does not claim the entire unit object was decoded.

Before ruleset enrichment, `type`, `name`, `domain` and `isMilitary` are null,
and `classificationKnown` is false. Enrichment joins the serialized type hash
to the matching Units table, not the changeable runtime type index. It resolves
the type key, domain and localized description. `isMilitary` is true for a
positive Combat/RangedCombat value or a nonnegative NukeDamageLevel; other
units, including noncombat support civilians, are excluded from the army view.
This is a ruleset classification, not decoded health, strength or readiness.

Field statuses are `unitPositions: extracted`, `unitTypes: partial` and
`militaryClassification: unavailable` before enrichment. The latter two become
`extracted` after every referenced type hash resolves. Coverage is the current
plot-reference lists; off-map/trade-manager objects are not traversed.

Renderer `mode` is separate from style: political (default), physical, or army.
Physical mode requires resolved terrain names and uses `terrainColors`
(type-to-hex overrides) plus `unknownTerrainColor` for explicitly unmapped mod
terrain. Army mode requires extracted positions and known military
classification for every major-empire unit. It groups military units by owner
and position; domain symbols show swords, ships or planes, with generic shields
for other/mixed domains. Only stacks of two or more have numeric badges.
SVG tooltips list unit types.
`armyMarkerSize` controls badge size (6–16, default 10). City-state and barbarian
forces are omitted without changing the underlying normalized data. Units are
not inferred from tile ownership, cities, replay events or score datasets.

Optional nullable unit fields `combatClass` and `unitClass` are exact `Units`
ruleset keys (`CombatClass` and `Class`), resolved through the saved unit type
hash. Their absence/null does not imply any particular military role. Version
0.1 remains valid; this is additive metadata. `armyIcons: detailed` maps known
combat classes to presentation categories, with exact class overrides for
airships and guided missiles. Unknown categories fall back to domain icons;
mixed-role stacks use a shield. No inference from localized names is used.

`showMilitarySummary: true` appends counts by empire and role below the map.
It counts the same validated major-empire military units as map markers,
including zero-count empires and excluding city-state/barbarian/civilian units.
Known inactive/eliminated major empires with no units are omitted, using explicit
`capitalEvidence.playerAlive: false` or `eliminated: true`; unknown activity is
retained. These filters never remove an empire with counted military units.
Totals are unit counts, not strength. Summary size grows with the number of
empires/categories and leaves map coordinates unchanged. Both settings require
army mode. CLI equivalents are `--army-icons detailed` and `--military-summary`.
