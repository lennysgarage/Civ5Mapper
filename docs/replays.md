# Replay CLI experiment

Install the command and optional GIF dependencies, then activate the virtualenv:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[gif]'
source .venv/bin/activate
civmapper --help
```

`extract-replay` exports reusable replay JSON. No Go runtime is used. SVG rendering and replay
parsing remain standard-library operations. GIF uses Pillow and CairoSVG so
frames reuse the existing SVG colors, borders, geography and labels.

```sh
civmapper extract-replay game.Civ5Replay -o replay.json
civmapper extract-replay game.Civ5Save -o replay.json
civmapper render-replay --map base.Civ5Map --replay replay.json \
  --output replay.gif --maxturns 20
civmapper render-replay --replay game.Civ5Save --output replay.gif
```

A supported save supplies its own physical geography, so no original map is
necessary. A matching normalized world JSON can add resolved terrain/features,
civilization names and colors without bringing current politics into history:

```sh
civmapper render-replay --map artifacts/real-world.json \
  --replay 'AutoSave_Post_0132 AD-1420.Civ5Save' \
  -o artifacts/real-replay.gif --style examples/atlas-style.json \
  --duration 300 --scale 0.5
```

A standalone replay records physical tiles but **does not record map wrapping**.
Supply a matching map, or explicitly choose `--wrap-x` / `--no-wrap-x`. Unknown
wrapping is never silently inferred from dimensions or map-script names.
Unresolved feature IDs and civ colors remain unknown; renderer fallback colors
are styling. Standalone replay terrain indices do not establish mod terrain names.

`--maxturns N` limits the first N **eventful turns**, as upstream does, rather
than selecting turn number N. Zero means all. Turns and tile output are sorted;
event order within a turn is preserved. Each selected eventful turn becomes one
frame, including turns whose only event is a notification. GIF duration defaults
to 1,000 ms per frame. The exporter bounds frame memory; lower `--scale` or
`--maxturns` for large maps. A shared palette is sampled across every frame.
An `.svg` output exports the last selected frame without optional dependencies.

## Major-event captions

```sh
civmapper render-replay --replay game.Civ5Save --style parchment \
  --captions -o replay-captioned.gif --duration 300
civmapper render-replay --replay examples/synthetic-replay.json \
  --no-wrap-x --style atlas --captions -o synthetic-captioned.svg
```

`--style` accepts installed names (`atlas`, `parchment`, `minimalist`) or a
custom JSON path; `civmapper styles` lists the presets. `--captions` is disabled
by default. When enabled, both GIF and SVG exports gain a fixed 120 SVG-unit
panel below the original map. The map's geometry and label placement stay
unchanged. Every animation frame has the same dimensions, including turns
without a major event. Existing frame timing and eventful-turn limits apply.
The extra pixels count toward the existing GIF memory budget.

Captions cover city founding, logged ownership changes affecting a known city,
and removal of a known city. Routine territory claims, notifications (including
war/peace messages), religious events and unknown event types are excluded.
Claim events that actually change an existing city's recorded owner qualify;
the ordinary expansion of territory does not. Captions follow original event
order. A written message is displayed once per qualifying event, even if that
event lists multiple tiles.

Recorded text is preferred and retains its original language. Empty messages
use validated city transitions, such as `Ownership changed: Harappa — ... →
Lennysgarage.` Names follow the style's `empireLabels` setting. The wording does
not assume capture versus trade, or razing versus another cause of removal.
Unnamed cities use their logged coordinates; missing names are never invented.

The footer shows up to three event rows and a count of additional major events.
Long rows receive an ellipsis, and SVG tooltips contain the full messages,
including overflow events. GIFs show the shortened text only. A turn without
a qualifying event displays `No major events recorded this turn.` Visual line
breaks and repeated whitespace are normalized; original messages remain in
the tooltips and original replay JSON. No facts or captions are added to the
normalized world/replay schemas. Python `render_replay(..., captions=True)`
also includes complete caption strings in its per-frame report.

## Implemented parity and deliberate limits

Binary layout adaptations retain their MIT copyright and permission notice;
see [NOTICE](../NOTICE).

| Behavior | CivMapper |
| --- | --- |
| Replay roster, events, datasets and physical tiles | Parsed, with bounded counts and full trailing-byte validation |
| Save embedded events | Sequential validated state-v1 header through random/message records; no event-pattern scan |
| City founded (1) | Marker/name from event text; ownership must also be logged |
| Tiles claimed (2), city transferred (3) | Stored owner applied to listed tiles and any city there; -1 means unowned |
| Tiles razed (4) | Owner and city cleared |
| Notifications/religions/pantheons | Retained as events, no invented political effect |
| Unknown event types | Preserved without interpreting their effects |
| Base map dimensions, plot type, terrain | Exact checks; mismatch exits 2 |
| River difference / map filename difference | Warning, matching upstream policy; feature IDs excluded from geography comparison because they are mod-dependent |
| Scenario initial cities/ownership | Seeded using exact key joins or explicit `--owner-map` JSON; uncertain ID mapping fails |
| JSON reuse, GIF, eventful-turn limit | Supported |
| Upstream pixel appearance/delta encoding | Not reproduced; deterministic atlas SVG frames with full-frame GIF encoding |

An owner mapping file is a JSON object such as `{"32": 8}`: scenario owner 32
maps to replay civilization index 8. Save slots, scenario owners and replay
indices are distinct namespaces. No English-name-to-civilization-key guess is
used. Exact metadata joins can populate styling; ambiguous scenario joins
require explicit mapping. Final-save geography JSON starts politically empty.

Upstream marks a razed tile as a road; CivMapper leaves historical road state
unknown because the event does not record a road. Historical capitals,
alliances, population, renamed-city changes and infrastructure are unavailable.
Present-day capital stars, allied shading and roads never appear in earlier
frames solely because they exist in the final save. City names strip the known
English ` is founded.` suffix, as upstream does; other languages retain literal
event text. A log lacking city ownership fails instead of guessing.

The replay contract is separate from world JSON, with `kind: replay` and its
own [schema](../schemas/replay.schema.json). Both remain schema version 0.1;
existing world consumers are unchanged. `extraction.status: complete` means the
supported replay sections were parsed, not that every historical field exists.
Warnings and field statuses state those limits. `.Civ5Save` event exports have
`datasets: null`; player history datasets are not yet traversed. Standalone
replays have the complete embedded dataset categories and turn/value arrays.

## Format evidence and real verification

The local upstream checkout is pinned to the requested commit. Python map and
standard replay layouts adapt its MIT implementation; attribution is in NOTICE.
Observed Lekmod messages add three int32 fields between tiles and civilization
ID. They are retained as `extendedData` rather than interpreted as map facts.
[The game's replay-message serializer](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvReplayMessage.cpp)
and [game serializer](https://github.com/EnormousApplePie/Lekmod/blob/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvGame.cpp)
corroborate this conditional layout and timer fields. Standard and extended
profiles must validate uniquely, including the following geography section.
The supported save header has 29 scalar fields, optional five/nine empirical timer bytes,
10 boolean flags, bounded hash arrays (zero hash omits its value), two empty
vote free-list arrays, random version 1 and message version 1/2. Unknown shapes
fail. Older game-state versions with upstream hardcoded mod padding are not
ported or advertised as supported.

59 Windows replays were copied and hash-verified without modifying originals.
56 parse: standard and extended version-1 replay layouts. Three older files
(Casimir III twice and Gajah Mada) present a version-0/legacy layout that remains
unsupported, with explicit errors. They need older serialization evidence and
new fixtures; no partial animation is substituted. `artifacts/replay-corpus-report.json`
records every result. `scripts/validate_replays.py` reproduces the check.

All 138 copied saves pass sequential embedded replay parsing (including the
initial save with an empty log); results are in
`artifacts/embedded-replay-corpus-report.json`. The three singleplayer saves
decode standard embedded messages,
using zero/five timer-byte profiles. No new plot/city profile is needed.

The turn-132 save contains 711 events and yields 130 eventful-turn frames. Its
last replay state has all 56 current cities and exactly 1,275 owned tiles.
Verification compares each final owner/city coordinate against current save
extraction. A real `.Civ5Replay` and an explicitly synthetic fixture also render.
The local `europe1939.json` adapter matches all 9,828 physical/political tiles,
258 cities and 39 owner entries. `scripts/validate_upstream_map.py` reproduces
that data check; atlas pixel parity is not claimed. A copied real v12 map also
validates its free-list arrays. V11 uses synthetic binary fixtures.

`render-replay --mode physical` uses resolved terrain from a matching map or
enriched world JSON, with ownership fills and territorial borders omitted.
This is the recorded geography snapshot; historical terrain changes are not
reconstructed. `--mode army` fails explicitly because replay events do not
provide historical unit positions. Use `render-save --mode army` for current
forces, including naval stacks and excluding city-state armies and civilians.

## Generic save scaffold

`civmapper inspect ...` now reports `inspection.layoutDiagnostics`: first plot
version and offset, each existing profile's full-grid validation result, yield
counts backed by successful grid validation, and bounded city-prefix version
candidates. Byte-pattern candidates are explicitly unvalidated research hints;
they never populate world cities or authorize a new profile. A missing map
anchor leaves these unknown. Save header versions other than 8 still fail.
This adds diagnosis, **not generic save compatibility**. To support a new DLL,
obtain its serialization evidence, build fixtures, validate full grids/current
cities and document the profile before enabling extraction.
