# TypeScript migration and validation

Implemented 2026-10-12. Python, its upload server and packaging have been retired.
The Node CLI and one-page static application share the format and SVG core in
`packages/core/src`. Node 22.12+ is required for development and the CLI;
end users of the hosted application need only a modern browser.

## Architecture

- `packages/core/src/binary.ts`: bounded little-endian reader and pako inflate.
- `save.ts`, `extract.ts`, `diplomacy.ts`, `capitals.ts`, `units.ts`: validated
  current-state extraction, diagnostics and evidence.
- `mapio.ts`, `replay.ts`, `replay_render.ts`: map/replay decoding and an event
  state machine independent of the current-state renderer.
- `index.ts`: plain JavaScript world/replay API with unchanged JSON schema 0.1.
- `render.ts`, `routes.ts`, `military.ts`: deterministic SVG geometry/icons.
- `ruleset.ts`: optional sql.js enrichment from supplied database byte buffers.
- `raster.ts`: optional Resvg WASM rasterization and gifenc animation adapter.
- `html.ts`: self-contained map documents using the shared viewer.
- `packages/cli`: filesystem/path protection and Commander command dispatch.
- `packages/web`: Vite page, session inputs, cancellable worker and viewer UI.

The binary/rendering algorithms were ported directly. `compat.ts` implements
collection semantics, structural tuple keys, checked field access, numeric and
binary helpers used by those algorithms. It is not a Python interpreter or a
runtime translation layer; no Python code, process or WASM Python runtime is
required. Internal types retain flexible diagnostic dictionaries; the public
facade exposes world/options interfaces and plain JSON data. Strict typing of
every experimental binary structure remains a possible later improvement.

## Compatibility evidence

No new save or replay compatibility is claimed. Supported layouts remain:

| Input | Support and evidence |
| --- | --- |
| Save header 8 / state 1 / plots 7 / cities 6 | Two explicit profiles: `bnw-six-yield` and `observed-seven-yield`; current-world output, optional v9 units and errors match on all 138 copied saves |
| Embedded save replay | Full event/geography JSON matches the previous parser on all 138 copied saves |
| Standalone replay v1 | Standard and observed extended profiles; identical full JSON for 56 copied replays and identical failures for three unsupported legacy files |
| `.Civ5Map` v11/v12 | Synthetic binary comparisons; full JSON equality on a real v12 128×80 map |
| Scenario map JSON | Full normalized JSON equality on a 9,828-tile reference scenario; all 258 cities and 39 owners preserved |
| Normalized world/replay JSON 0.1 | Existing contracts preserved; no breaking schema changes |

The 135 multiplayer autosaves are correlated snapshots from one game, alongside
three singleplayer saves. These comparisons establish port parity, rather than
new independent evidence for arbitrary DLLs, platforms or game versions.

Local ignored reports:

- `artifacts/typescript-corpus-parity.json`: 197/197 equal outcomes, including
  the three deliberately unsupported standalone replays.
- `artifacts/typescript-embedded-parity.json`: 138/138 equal embedded replay logs.
- `artifacts/typescript-replay-corpus-report.json`: 56/59 standalone replays supported.
- `artifacts/typescript-scenario-report.json`: exact geography/ownership/cities.

These private oracle comparisons ran before Python removal. They compared
parsed JSON structurally and error messages exactly, rather than only comparing
summary counts. The old implementation remains in the repository's earlier Git
commit for future investigation, without becoming a deployed dependency.

## Automated and browser checks

`npm run check` checks both core/CLI and browser TypeScript. `npm test` passes
319 cases: 312 compressed, explicitly synthetic oracle cases and seven native
integration cases. The comparison fixtures preserve field values, mutations,
error messages and exact SVG strings. A mocked unit-interval test was replaced
with real serialized 64-player anchors before capturing the native fixture;
production parsing has no mock or synthetic fallback.

Native cases exercise input/decompression limits, SQLite hash joins and
classification, byte-for-byte repeatable GIF output, PNG decoding signatures,
frame counts, HTML escaping/grouping, turn-one validation, installed CLI options,
input/symlink protection and exit-2 failures. Fixtures contain no private saves.

The real turn-132 save still produces 58×52 geography, 3,016 tiles, 56 cities and
497 plot-referenced units. Enriched JSON matches the earlier parser exactly;
political, physical and detailed-army SVGs are byte-for-byte equal. Real-save and
synthetic two-frame GIFs render, and the installable npm package independently
produces PNG and offline HTML from outside the repository.

Chromium acceptance checks pass for the real save in the static app: political,
physical and army views; pointer details/pan/zoom; player-group filters; visible
PNG exports; mobile layout; replay stepping/playback; browser GIF generation;
cancellation and invalid replacement recovery. Self-contained CLI HTML also
passes with HTTP(S) blocked. Project-subdirectory hosting is checked separately.
Browser reports have no JavaScript errors or external requests. The app makes no
save upload request and stores no files beyond session memory.

Raster engines changed from the former optional Python adapters to Resvg/gifenc.
SVG data/geometry parity is exact; PNG antialiasing, fallback font metrics and GIF
palette/compression bytes are not claimed to match those engines. Browser canvas
PNG preserves the live displayed SVG and current viewport/layers/filters.

## Remaining limitations

Format limits and unavailable fields in [feasibility.md](feasibility.md) and
[replays.md](replays.md) still apply. Unsupported binary structures fail; replay
logs cannot provide historical armies/capitals/roads/alliances. Ruleset caches
must match the save, especially for Lekmod. Browser parsing may take several
seconds on larger saves; cancellation stays responsive because decoding is in
a worker. GIFs retain the existing frame/total pixel budgets and may require a
smaller scale or eventful-turn limit. Independent in-game comparison and a wider
version/DLL corpus remain the next extraction experiments.

## Browser input parity follow-up

The first browser acceptance run supplied matching caches before opening the
save. This missed a workflow difference: the Python command discovered local
cache files automatically, while a plain browser save upload left city names as
localization keys and physical/army modes unavailable. The frontend now ships
536 KiB of default lookup databases derived from those same caches. English name
tags and the eight required ruleset tables are preserved, with original and
compact-file hashes recorded in `assets/databases/manifest.json`.

The acceptance check now opens the real turn-132 save with no database selection,
checks every city name, terrain tile and unit classification, and compares the
complete rendered-world data with the prior enriched export (excluding byte
hashes, entity order and the separate binary inspection report). Metadata changes
refresh the current world and retain the viewer state. Explicit incompatible
overrides fail; incompatible defaults leave independently parsed political data
usable with a visible explanation. Clicks on empty/unclaimed areas clear an
empire highlight, while panning preserves it. The frontend Offline HTML download
has been removed; CLI HTML output remains supported.
