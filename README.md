# CivMapper

Experimental, MIT-licensed Civilization V **save → normalized JSON → political
map** CLI. The first milestone works on the tested saves: the supplied turn-132
multiplayer save yields a 58 × 52 world with 3,016 tiles and 56 current cities,
rendered as SVG and PNG. No original `.Civ5Map` is needed.

This is a supported-format prototype, **not an arbitrary-save decoder**.
All 138 copied examples passed extraction: 135 multiplayer autosaves from one
game and three singleplayer saves, using two explicit binary layout profiles.
Inland lakes, elimination and custom civilization
name overrides remain unknown. See [the feasibility report](docs/feasibility.md).

Python 3.10+; extraction and SVG rendering use only the standard library:

Start the local upload server:

```sh
python3 -m civmapper serve
```

Open **http://127.0.0.1:8000/**, choose a style and drop in a `.Civ5Save`.
Explore political, physical and army views, then click **Export PNG** to
save the visible map with its current filters, layers and zoom. **Fit map**
exports the whole world. Saves are processed in memory and never modified.
The server uses the same local ruleset lookup as `render-save`, with no new
Python dependencies. See [server instructions](docs/server.md) for options.

For a static map directly from a save, use one command (PNG needs `.[png]`):

```sh
civmapper render-save '/path/to/game.Civ5Save'
```

This writes `artifacts/<save-name>.png` in the current directory, creating the
output folder if needed. Use `-o map.svg` or `-o map.png` for another destination.
It uses the atlas defaults and automatically reads databases from the current
directory's `artifacts/ruleset/` when present. Matching checks still apply;
`--no-enrichment` disables automatic lookup. Explicit `--ruleset`,
`--localization`, `--style`, `--profile`, `--scale` and `--no-player-names`
remain available. Native filesystem paths are accepted; quote spaces. No
intermediate JSON file is needed.

```sh
mkdir -p artifacts
python3 -m civmapper extract 'AutoSave_Post_0132 AD-1420.Civ5Save' \
  -o artifacts/world.json
python3 -m civmapper render artifacts/world.json -o artifacts/map.svg
python3 -m unittest discover -s tests -v
```

City records sometimes store localization keys. To obtain readable names,
terrain names, mod features and the game's saved player colors, optionally
supply **matching** game cache databases. Local copies are already available
in this workspace:

```sh
python3 -m civmapper extract 'AutoSave_Post_0132 AD-1420.Civ5Save' \
  -o artifacts/real-world.json \
  --ruleset artifacts/ruleset/Civ5DebugDatabase.db \
  --localization artifacts/ruleset/Localization-Merged.db
python3 -m civmapper render artifacts/real-world.json -o artifacts/real-map.svg
```

The parser checks civilization database IDs and terrain water classifications
before using the ruleset; unrelated mod caches can fail these checks. Matching
checks do not prove every mod definition is identical. Databases are read-only,
and their hashes are recorded. Without them, identifiers remain explicit and
renderer fallback colors are presentation choices, never extracted game facts.

Optional installable CLI and PNG exporter:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[png]'
.venv/bin/civmapper render artifacts/real-world.json \
  -o artifacts/real-map.png --scale 2
```

Open SVG in a browser or vector editor. The current workspace includes
[the real SVG](artifacts/real-map.svg), [PNG](artifacts/real-map.png),
[normalized world](artifacts/real-world.json) and
[corpus results](artifacts/corpus-report.json). These local artifacts are
ignored by Git, alongside saves and database copies; they are not public
fixtures. Original Windows saves were copied without modification.

For unsupported saves, metadata inspection remains useful:

```sh
python3 -m civmapper inspect path/to/game.Civ5Save \
  -o artifacts/inspection.json --dump-state artifacts/state.bin
python3 scripts/validate_corpus.py artifacts/save-corpus \
  -o artifacts/corpus-report.json
```

`inspect` emits partial JSON; it cannot be rendered. `extract` requires one
validated profile and all expected plots/cities, failing instead of approximating
missing records. Errors exit 2. Outputs must differ from inputs. Binary dumps
and world JSON include game information; keep private games local.

The parser and renderer are independent modules linked by the
[JSON contract](docs/normalized-json.md) and
[draft schema](schemas/world.schema.json). SVG rendering merges neighboring land
hexes into polygons with islands/holes, draws exact coastlines and ownership
borders, handles horizontal seam adjacency, places labels with basic collision
checks, and adds known mountain/forest symbols. There is no geography smoothing
or guessed geography. A crowded city label may be omitted while
its marker remains; country labels use the largest connected territory.

Multiplayer maps default to saved **player display nicknames** as empire labels.
Account suffixes are removed using the game's display-name rule. Missing names
fall back to civilization labels; names can persist after AI takes over a slot.
`extract --no-player-names` omits nicknames from exported JSON. `inspect` continues
to omit them by default. Current city-state allies are decoded from validated
MinorCivAI records and rendered as lighter shades of their ally's color, retaining
their own borders, city labels and owner IDs. Unknown/unallied relationships are
never shaded. SVG territory tooltips identify the ally.

Use `empireLabels: "civilization"` to show civilization labels,
`shadeAlliedCityStates: false` to disable alliance coloring, or `allyShade`
(0.05–0.85, default 0.35) to control how much white is mixed into the ally color.
An explicit city-state `colorOverrides` entry takes precedence.

Water defaults to dark blue when unclaimed and a common teal when owned,
matching the reference's contrast. `oceanColor` and `ownedWaterColor` configure
these fills; `showOwnedWater: false` returns all water to the ocean fill.
Ownership borders still distinguish neighboring empires' water. Mountain icons
now have larger gray bodies, light peaks and dark outlines; `mountainSize`
(default 16, range 6–30) controls their size, and `showMountains` toggles them.
Only decoded mountain tiles receive icons.

Empire capitals have gold stars in circular badges; city-state capitals have
purple diamond badges. Both are selected from each player's saved current
capital reference. The supplied save has 15: six empire capitals and nine
city-state capitals. Captured former capitals are not marked from historical
flags. `showCapitals` toggles the icons; `capitalSize` defaults to 12 (range 6–16).
City-states have a single city label rather than a duplicate territory label;
`cityStateLabelColor` (default muted purple) distinguishes it from empire cities.

Roads connect adjacent tiles with decoded physical routes, including city tiles.
Pillaged sections are dashed red; resolved railroads use dark dotted strokes.
This displays infrastructure, not inferred trade connections or harbor links.
Route names require a matching ruleset database; unresolved route IDs still
render as generic connections. `showRoads`, `roadColor`, `roadWidth` (0.5–5,
default 2) and `railroadColor` configure the layer.

Unclaimed land uses pale cream with subtle diagonal hatching, visually distinct
from city-state fills. `showUnownedPattern: false` restores a solid fill, and
`unownedColor` configures the background. Water uses its separate colors.

Known river edges are drawn in blue, following the hex boundaries. The supplied
save has 435 stored edges. `showRivers`, `riverColor` and `riverWidth` (0.5–5,
default 2) configure them. Missing edge information remains undrawn.

Replay commands are available through `pip install -e '.[gif]'`:

```sh
civmapper extract-replay game.Civ5Save -o replay.json
civmapper render-replay --map base.Civ5Map --replay game.Civ5Replay \
  --output replay.gif --maxturns 20
civmapper render-replay --replay 'AutoSave_Post_0132 AD-1420.Civ5Save' \
  --map artifacts/real-world.json --output artifacts/real-replay.gif \
  --style examples/atlas-style.json --scale 0.5 --duration 300
```

The real [replay GIF](artifacts/real-replay.gif) has 130 eventful turns. A supported
save provides geography without a map; standalone replays require a matching
map or explicit wrapping choice. 56/59 copied replay files parse; three legacy
files remain unsupported. Historical capitals, alliances and roads are unknown,
so present-day markers and relationships are not projected backward.
See [replay usage, parity limits and format evidence](docs/replays.md).
`inspect` now includes candidate layout diagnostics for unsupported DLLs;
generic save compatibility remains future work.

Styles can be selected by name on `render-save`, `render`, and `render-replay`:

```sh
civmapper styles
civmapper render-save '/path/to/game.Civ5Save' --style parchment
civmapper render artifacts/real-world.json --style minimalist -o artifacts/minimalist.svg
civmapper render-replay --replay '/path/to/game.Civ5Save' \
  --style atlas --captions -o artifacts/replay-captioned.gif
```

The installed presets are `atlas` (the default colorful atlas), `parchment`
(warm paper colors and brown outlines), and `minimalist` (light oceans, thin
borders, no mountain or forest icons). Presets work from any directory.
Custom JSON remains supported: `--style examples/atlas-style.json`, or files
in `examples/styles/`. Use a path such as `./atlas` if a custom file has the
same name as a preset. `colorOverrides` changes presentation without mutating
world facts. Omitting `--style` preserves the existing default appearance.

Replay `--captions` adds a fixed panel beneath the map for major city events.
It is opt-in and supports GIF or SVG output; ordinary render commands are
unchanged. See [caption behavior and limits](docs/replays.md#major-event-captions).

Choose a map mode separately from its style:

```sh
civmapper render-save '/path/to/game.Civ5Save' --mode physical
civmapper render-save '/path/to/game.Civ5Save' --mode army
civmapper render-save '/path/to/game.Civ5Save' --mode army --army-icons detailed --military-summary
civmapper render-save '/path/to/game.Civ5Save' --mode physical --style parchment
```

`physical` colors the actual terrain (grassland, plains, desert, tundra, snow,
coast and ocean), with hills and geographic feature symbols. It omits political
fills, country labels and territorial borders. Cities, capitals, coastlines,
rivers and known roads follow the selected style. Mod terrain without a color
mapping uses an explicitly unmapped neutral color; custom `terrainColors` can
provide it. Terrain names must be resolved from a matching ruleset.

`army` uses the political map with empire-colored military symbols at actual
unit tiles: crossed swords for land, ships for naval and planes for air units.
Other or mixed domains use a generic shield. Single units have no number;
stacks of two or more add a small count badge. SVG tooltips list unit types.
Naval, air and nuclear units are included. Noncombat civilians, city-state
armies and barbarians are excluded. The save's unit owner is used even when
the unit stands in foreign territory or water. No army strength is inferred
from these counts. This displays current save data, including hidden units;
there is no player-specific fog-of-war filter.

`--army-icons detailed` selects infantry/melee, ranged, cavalry, mounted ranged,
siege/artillery, armor, recon, naval melee/ranged, submarine, carrier, fighter,
bomber, helicopter, airship, missile and nuclear symbols using matching ruleset
combat/class keys. Mixed-role stacks keep a shield; missing or unknown classes
fall back to domain symbols. Unit names are never used to guess roles. Existing
JSON can be re-extracted with `--units` and the matching ruleset to include class
metadata. The default remains the simpler domain icon set.

`--military-summary` appends empire cards below the map, with total military
units and counts by role. Major empires are listed, including those with
zero plot-referenced military units; known inactive/eliminated empires with no
units, city-states and barbarians are omitted. Unknown activity remains visible.
Its counts use exactly the units shown by army markers, including naval/air
forces. Unknown classes appear under other land/naval/air/other units. These
counts measure units, not combat strength, and omit off-map objects.
Both options require `--mode army` and work with `render-save` or JSON `render`.
Custom styles can set `armyIcons` (`domain`/`detailed`) and
`showMilitarySummary` (boolean); CLI options override these settings.

The one-command army path automatically requests unit extraction and uses the
same matching local database lookup as other save renders. Unclassified major
units cause exit 2 instead of treating every unit as military. The defaults are
`artifacts/<save-name>-physical.png` and `artifacts/<save-name>-army.png`, keeping
the political output separate. Explicit `-o` selects PNG, SVG or offline HTML.

For reusable army JSON:

```sh
civmapper extract game.Civ5Save --units --ruleset matching.db -o world-units.json
civmapper render world-units.json --mode army --style atlas -o army.svg
```

Existing JSON without unit data still renders political/physical maps. Physical
replay mode works with resolved base-map terrain; replay logs do not supply
historical armies. See [unit format evidence and limits](docs/feasibility.md#current-unit-extraction).

Export an interactive map you can open directly in a browser:

```sh
civmapper render-save '/path/to/game.Civ5Save' --mode army \
  --army-icons detailed --military-summary -o map.html
# Or reuse extracted, enriched JSON:
civmapper render world-units.json --mode army -o map.html
```

HTML includes zoom/pan, layer toggles, clickable cities/unit composition, city
search and empire highlighting from the military summary. Political/physical/
army view switches are enabled only when the embedded data supports them.
Human and AI player-group toggles work from a single save by default. Current
human slots and retained player names count as Human, including AI takeovers.
A retained lobby name also qualifies; this does not prove turn-1 participation.
No reference save or extra flag is required.
Excluded armies/cities/labels/cards are hidden, with faint territory context;
city-states and unknown groups stay visible.
The page is self-contained and works offline with no server, external fonts,
scripts or original save. Use army mode when exporting a save to include unit
extraction; a political-only save export cannot enable an army view later.
`--military-summary` expands role counts in the sidebar; empire cards always
show totals when verified army data is available. See [HTML export](docs/html-export.md).

The explicitly fictional [synthetic world](examples/synthetic-world.json)
and [SVG](examples/synthetic-map.svg) demonstrate rendering independently.
Regenerate with `python3 examples/make_synthetic.py` and the render command.
Tests use small synthetic binary fixtures; real saves are never bundled.

Research, format limits and next experiments are documented in
[docs/feasibility.md](docs/feasibility.md). Attribution and license review are in
[NOTICE](NOTICE). No UI or AI dependency is included; GIF export is optional.
