# Offline interactive maps

`render-save ... -o map.html` and `render world.json -o map.html` export one
self-contained file (`.htm` is also accepted). Open it directly in a modern
browser, including from `file://`. Python's standard library generates the
document; PNG/GIF dependencies are unnecessary. No web server, CDN, remote
font, account or network connection is needed.

```sh
civmapper render-save '/path/game.Civ5Save' --mode army \
  --army-icons detailed --military-summary -o map.html
```

Drag to pan, scroll or use +/− to zoom, and use **Fit map** to reset. The map
also supports +/−/0/Escape keys when focused. City and army markers support
keyboard focus and Enter/Space. Sidebar controls have ordinary keyboard
navigation. Touch dragging works; pinch zoom is not implemented. The layout
places controls below the map on narrow screens.

Layer switches control armies, cities, roads, rivers, city labels and empire
labels. Layers are generated for toggling, with initial visibility based on
the style's settings; labels remain subject to the renderer's collision rules.
Capital appearance and terrain symbol choices follow the selected style.
Controls for layers absent from the current view are disabled, preserving
their visibility choice when switching views.

Click a unit marker for its owner, coordinate, count and unit-type composition.
Click a city for its owner, position and any known capital/population data.
City search provides named results with owners, handles duplicate city names,
and centers the viewport using the rendered marker's actual bounds. Searching
can re-enable hidden city markers. Click territory, an empire card, or select
an empire to mute other ownership fills, units, cities and labels. Clearing
the highlight restores them. Physical mode has no political territory fills;
its highlighting applies to cities/labels while leaving terrain visible.

Player groups has independent **Human players** and **AI players** checkboxes.
Both start enabled. Turn off AI for a human-only view, or turn off Human for an
AI-only view. Excluded groups' units, cities, labels and sidebar cards are
hidden; their territory remains faint for geographic context. City-states and
unknown groups remain visible. Layer preferences and group choices persist
through view switches. Hiding a selected empire clears its highlight; city
search and the empire dropdown include only enabled groups.

Groups work from the supplied save by default: a major with current
`SS_TAKEN` (3) status or a nonempty retained `playerName` counts as Human.
A major with `SS_COMPUTER` (1) and no retained name counts as AI. Other statuses
without names remain unknown. Former human names therefore stay in Human after
AI takeover. Retained lobby names also qualify: this convenient display rule
does not prove turn-1 participation. In the turn-132 example both BenPltt and
Erlington are grouped as Human. `--no-player-names` removes the name-based
signal, so an AI takeover may then be grouped as AI.

No additional flag or turn-1 save is needed:

```sh
civmapper render-save current.Civ5Save --mode army --military-summary -o map.html
civmapper render world-units.json --mode army -o map.html
```

`--turn-one-save` remains optional for collecting historical evidence in JSON.
It validates matching grid/geography/major slots and records
`civilizations[].turnOneSlotStatus` and `game.turnOnePlayerEvidence`; those
fields do not override the default display grouping. The reference must be
from the same game at turn 1; lobby/turn-0 snapshots and mismatches exit 2.
No source saves are edited.

The sidebar displays military totals whenever verified army data is available;
`--military-summary` expands each card's role breakdown. Clicking a card also
shows the breakdown in Map details. Counts use the same validated units as army
markers, exclude civilians/city-states/barbarians, and omit known inactive
empires with no forces. Without unit data, empire cards show city counts and
the army view is disabled; unavailable data is never presented as zero forces.

All views reuse `render_svg`; HTML adds selection metadata to rendered features
without altering hex geography, borders or unit positions. View switches reuse
embedded SVGs and retain the viewport/highlight. Physical requires resolved
terrain names; army requires extracted positions and military classification.
Unavailable views are disabled with explanations under Available views. The
requested initial view must be valid or the CLI exits 2. Detailed roles fall
back exactly as in SVG/PNG exports.

Save exports with `--mode army` request unit extraction and matching ruleset
enrichment as usual. Political/physical save exports do not automatically parse
units. To open initially in political mode with army switching enabled, extract
enriched unit JSON first, then `render world-units.json -o map.html`.

The file embeds normalized game/civilization/tile/city/unit data (without the
parser's `inspection` collection), alongside its SVG views. It includes saved
hidden unit positions like the static army maps; no player-specific fog-of-war
filter is applied. It does not embed the original save, database files or raw
network settings. JSON is escaped for script boundaries, dynamic details use
text nodes, and all SVG names/identities are escaped. Embedded snapshots can
make the file several MB. `--scale` applies to PNG exports, not HTML zoom.

Replay HTML, timeline playback, editing, theme switching and map downloads are
not implemented. Replay exports remain SVG/GIF and cannot reconstruct armies.

## Verification

Run `python3 -m unittest discover -s tests -v` for Python/CLI/schema-adjacent
checks. The browser acceptance check requires Node 22+ and an installed Chromium
executable; it has no npm dependencies:

```sh
node scripts/validate_html.mjs map.html /path/to/chrome report.json
```

It opens the file with HTTP/HTTPS requests blocked, verifies actual pointer
clicks and panning, zoom, army toggles when available, empire cards, city search,
all enabled views and mobile layout. It rejects JavaScript errors and external
network requests. The optional report also saves a desktop screenshot. Local
real-save results are under `artifacts/html-browser-report.json`; the generated
example is `artifacts/turn132-interactive.html`.

## PNG download

New HTML exports include **Export PNG**. This saves the current map area, mode,
layer visibility, player filters and highlight using browser canvas; it omits
the sidebar. Use **Fit map** for the whole world. Resolution is twice the visible
map size, capped at 4096 pixels per side, without requiring CairoSVG. The same
viewer is available through the [local upload server](server.md).
