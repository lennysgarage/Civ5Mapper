# Local save upload server

Start from the project directory:

```sh
python3 -m civmapper serve
# Or, after pip install -e .:
civmapper serve
```

Open **http://127.0.0.1:8000/**. Choose a style, then drop a `.Civ5Save` onto the
page or use **Open save**. You can drop another save over the loaded map to
replace it. Uploads are processed in memory; original saves are never changed
and the server does not keep an upload folder or save history.

The embedded viewer has the same political/physical/army views, Human/AI
filters, layer toggles, city search, highlights and military summaries as the
CLI HTML export. All available modes are prepared on upload. Unsupported saves
produce an error without replacing the previous map. If only unit decoding
fails, political extraction remains usable; the unavailable army view and its
reason appear under **Available views**. Other extraction/ruleset mismatches
still fail loudly.

Click **Export PNG** in the viewer's header to download the **currently visible
map area**. The image includes the selected mode, layers, Human/AI filters and
empire highlight, and preserves zoom/pan. It excludes the sidebar and controls.
Use **Fit map** first to export the whole map. The filename identifies the turn
and mode. Browser canvas rasterization uses twice the visible resolution, capped
at 4096 pixels per side, and needs no CairoSVG dependency. System font rendering
can differ between browsers. The same button works in newly generated offline
HTML exports.

## Ruleset and options

As with `render-save`, the default database lookup is relative to the launch
working directory:

- `artifacts/ruleset/Civ5DebugDatabase.db`
- `artifacts/ruleset/Localization-Merged.db`

Matching checks remain in force. Terrain names and military classification need
the matching ruleset; the viewer disables views for which required data is
missing. For an installation launched elsewhere, pass absolute database paths:

```sh
civmapper serve --port 8080 \
  --ruleset /path/to/Civ5DebugDatabase.db \
  --localization /path/to/Localization-Merged.db
```

`--no-enrichment` skips automatic lookup; `--no-player-names` omits saved
nicknames. `--profile` selects an existing validated plot profile. Choose atlas,
parchment or minimalist in the upload page before loading a save. Stop the
server with Ctrl+C.

This is a local process, bound to loopback only, with no authentication system
for remote hosting. Requests must use the local host and upload token supplied
by its page; no filesystem browsing endpoints are exposed. Uploads are limited
to 64 MiB, one conversion at a time. A busy request receives a retry message.
The server itself uses the Python standard library; PNG downloads use the
browser. No external web services, CDN or model is involved.

## Validation

```sh
python3 -m unittest discover -s tests -v
# With the server running, Node 22+ and a local Chromium binary:
node scripts/validate_html.mjs http://127.0.0.1:8000/ /path/to/chrome \
  artifacts/server-browser-report.json /path/to/game.Civ5Save
```

The browser check uploads the supplied real save, exercises viewer controls,
and decodes a PNG for each available mode. It checks that exported clipping and
visibility match the live SVG and writes the PNGs beside the report. It also
works on an offline HTML filename without the final save argument.
