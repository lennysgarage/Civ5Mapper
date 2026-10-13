# Static browser application

Build with Node 22.12+:

```sh
npm ci
npm run build
npm run preview
```

The deployable directory is **`dist/web`**, not the entire repository or `dist`.
Keep its `assets/`, `wasm/` and `fonts/` folders together. Relative URLs support
hosting under `/` or `/CivMapper/`; the app has no client-side routes requiring
rewrites. Serve JavaScript and WASM with their normal MIME types. No COOP/COEP
headers are required: WASM is single-threaded and uses provided byte buffers.
Vite preview is for local verification rather than production hosting, as
explained in the [Vite static deployment guide](https://vite.dev/guide/static-deploy.html).

## GitHub Pages

Use Pages with GitHub Actions, then manually run `.github/workflows/pages.yml`.
It installs locked dependencies, checks types/tests, builds and uploads only
`dist/web`. This repository adds the workflow but does not activate hosting or
publish anything. No source saves enter the deployment. Compact metadata
databases in `assets/databases/` are included.

## Cloudflare Pages

Connect the repository with build command **`npm run build`**, output directory
**`dist/web`**, and Node 22.12+ (for example `NODE_VERSION=22`). The root directory
is the repository root. No Pages Functions or upload endpoint is needed.
See Cloudflare's [build configuration reference](https://developers.cloudflare.com/pages/configuration/build-configuration/).
A direct upload of an already built `dist/web` works too.

## Cloudflare Workers static hosting

If the dashboard asks for a **deploy command**, you are using Workers Builds.
Use the repository root, build command **`npm run build`**, and deploy command
**`npx wrangler deploy`**. The root `wrangler.jsonc` explicitly points Wrangler
at `dist/web`, avoiding application detection at the npm workspace root. Set
its `name` to the Worker name selected in the dashboard (currently: `cvi5mapper`).
This deploys static files only; save decoding still runs in the browser.
No Worker script or backend is required. Pages hosting above remains supported.

To validate this configuration locally without publishing:

```sh
npm run build
npx wrangler deploy --dry-run
```

See Cloudflare's [static assets guide](https://developers.cloudflare.com/workers/static-assets/).

## Local inputs and exports

Saves, normalized JSON, optional ruleset/localization databases, base maps and
owner mappings are read through browser file inputs. Saves and databases each
have a 64 MiB input cap, with a 128 MiB decompression cap and bounded binary
counts. The upload area shows the selected filename, an indeterminate progress
bar and the current stage while reading, decoding, resolving metadata and drawing
the map. A header spinner also remains visible. Cancel remains available;
the indicator clears on completion, cancellation or errors. Reduced-motion
preferences disable loading animations. Browser cancellation terminates the worker. The last successful map
remains usable after cancellation or invalid replacement files. No storage,
IndexedDB, service worker or persistence is used.

Default Lekmod metadata loads automatically for unresolved save data. The two
bundled SQLite files total about **536 KiB**: ruleset identities, terrain/features,
routes, colors, unit classifications and English city/civilization/unit names.
No saved world state, graphics or unrelated game text is included. Values match
the caches previously used by the Python workflow; the exact Lekmod release is
unknown. Source and bundle hashes are recorded in
`assets/databases/manifest.json`. These defaults are verified with the local save
corpus, not a claim of compatibility with every mod or version.

Users can select matching cache databases per session, overriding either bundled
file, or disable bundled metadata. Changes update the current map without
reloading the save and retain its viewport, layers and highlighted empire.
Classification and color data are hash/identity checked; a mismatched default
leaves the independently valid political map usable and shows a notice requesting
matching databases. An invalid explicit override reports an error and keeps the
last valid map. Default army extraction failures are also reported.

To regenerate the compact databases from matching, read-only source caches:

```sh
node scripts/prepare_browser_databases.mjs \
  /path/to/Civ5DebugDatabase.db /path/to/Localization-Merged.db
```

The viewer supports political/physical/army modes according to available data,
layer/group toggles, highlights, city searches and regional exports. PNG/SVG
exports reflect the current viewer. Click empty or unclaimed map areas, use
Clear highlight, or press Escape to restore all empires; dragging preserves the
selection. The browser no longer offers an Offline HTML download. World JSON
exports the current normalized world. Replay JSON retains the source event log;
GIF uses the chosen replay mode, style, captions and frame settings.

Replay tools accept save/replay/JSON inputs. Standalone replay wrapping must come
from a matching base or an explicit selection. Playback uses recorded eventful
turns; missing turns are not interpolated. Historical armies remain unavailable.
Changing frame/style retains the viewer's viewport, layers and player filters.
The scene's geography and political updates use the same core as the CLI.

The static application requires HTTP(S) because browsers load its module worker
and assets. CLI-generated self-contained map HTML is separately usable from
`file://`; it contains rendered views and does not parse new saves.

## Browser acceptance check

With `npm run preview` running:

```sh
node scripts/validate_html.mjs http://127.0.0.1:4173/ /path/to/chrome \
  artifacts/browser-report.json /path/to/game.Civ5Save
```

The primary check uses only a save, asserting that bundled databases resolve
city names and enable both physical and army views. Optional ruleset/localization
paths can follow the save path to test overrides. Set `CIVMAPPER_EXPECTED_WORLD`
to a prior enriched JSON export for a complete world comparison (excluding
database byte hashes). The script verifies real local loading, viewer
interaction, live PNG exports, player groups, playback, browser GIF generation,
cancellation and invalid input handling. It rejects external network requests
and JavaScript errors. The same script accepts an offline HTML path with all
HTTP(S) access blocked. Chromium is a development check, not an application
dependency.
