"""Local, in-memory save upload server using the existing extraction pipeline."""
import html
import json
import secrets
import sqlite3
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .extract import extract_bytes
from .html_export import render_html
from .ruleset import enrich
from .save import MAX_INPUT
from .styles import PRESETS, load_style


@dataclass(frozen=True)
class ServerConfig:
    ruleset: Path | None = None
    localization: Path | None = None
    profile: str = 'auto'
    player_names: bool = True


def convert_save(data, config, style='atlas'):
    # Optional unit decoding must not prevent a supported political map. Decode
    # the base first so only unit-specific failures can trigger this fallback.
    world = extract_bytes(data, config.profile, include_player_names=config.player_names)
    try:
        world = extract_bytes(data, config.profile, include_player_names=config.player_names, include_units=True)
    except ValueError as error:
        world['extraction']['warnings'].append(f'Army view unavailable: {error}')
    if config.ruleset or config.localization:
        world = enrich(world, config.ruleset, config.localization)
    return render_html(world, dict(load_style(style), armyIcons='detailed', showMilitarySummary=True))


def upload_page(token):
    assets = files('civmapper').joinpath('web')
    options = ''.join(f'<option value="{html.escape(name)}">{html.escape(name.title())}</option>' for name in sorted(PRESETS))
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>CivMapper local server</title>
<style>{assets.joinpath('upload.css').read_text(encoding='utf-8')}</style></head><body>
<header><strong>CivMapper</strong><label>Style <select id="style">{options}</select></label>
<label class="choose">Open save<input id="save" type="file" accept=".Civ5Save"></label>
<span id="message" role="status">Drop a .Civ5Save to explore its world.</span></header>
<main id="drop"><div id="welcome"><h1>Your world, mapped.</h1><p>Drop a Civilization V save here, or choose Open save.</p>
<p>Explore political, physical and army views when available. Export the current view as PNG.</p>
<p class="hint">Processed by your local server. Save files are never modified or stored.</p></div>
<iframe id="viewer" title="Interactive Civilization map" hidden></iframe></main>
<script id="upload-config" type="application/json">{json.dumps({'token':token,'maxBytes':MAX_INPUT})}</script>
<script>{assets.joinpath('upload.js').read_text(encoding='utf-8')}</script></body></html>'''


def make_server(config=None, host='127.0.0.1', port=8000):
    if host not in ('127.0.0.1', 'localhost'):
        raise ValueError('the local upload server must bind to 127.0.0.1 or localhost')
    if type(port) is not int or not 0 <= port <= 65535:
        raise ValueError('port must be between 0 and 65535')
    config = config or ServerConfig()
    token = secrets.token_urlsafe(32)
    processing = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def respond(self, code, body, content_type='text/plain; charset=utf-8'):
            if isinstance(body, str):body = body.encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            authority = self.headers.get('Host', '')
            if authority not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                self.respond(403, 'Invalid local host');return False
            origin = self.headers.get('Origin')
            if origin is not None and origin != f'http://{authority}':
                self.respond(403, 'Cross-origin requests are not accepted');return False
            return True

        def do_GET(self):
            if not self.local_request():return
            if self.path == '/':self.respond(200, upload_page(token), 'text/html; charset=utf-8')
            elif self.path == '/favicon.ico':self.respond(204, b'')
            else:self.respond(404, 'Not found')

        def do_POST(self):
            if not self.local_request():return
            parsed = urlsplit(self.path)
            if parsed.path != '/upload':self.respond(404, 'Not found');return
            supplied = self.headers.get('X-CivMapper-Token', '')
            if not secrets.compare_digest(supplied.encode('utf-8'), token.encode('utf-8')):self.respond(403, 'Invalid upload token');return
            style = parse_qs(parsed.query).get('style', ['atlas'])
            if len(style) != 1 or style[0] not in PRESETS:self.respond(400, 'Unknown style preset');return
            if self.headers.get('Transfer-Encoding'):
                self.respond(400, 'Chunked uploads are not supported');return
            lengths = self.headers.get_all('Content-Length', [])
            if len(lengths) != 1 or len(lengths[0]) > 20 or not lengths[0].isascii() or not lengths[0].isdigit():
                self.respond(411, 'A valid Content-Length is required');return
            length = int(lengths[0])
            if not 0 < length <= MAX_INPUT:self.respond(413, 'Save must be between 1 byte and 64 MiB');return
            if not processing.acquire(blocking=False):self.respond(503, 'Another save is being processed; try again shortly');return
            try:
                data = self.rfile.read(length)
                if len(data) != length:self.respond(400, 'Incomplete save upload');return
                document = convert_save(data, config, style[0])
                self.respond(200, document, 'text/html; charset=utf-8')
            except (ValueError, KeyError, TypeError, OSError, sqlite3.Error) as error:
                self.respond(422, f'Cannot render this save: {error}')
            finally:
                processing.release()

    return ThreadingHTTPServer((host, port), Handler)


def serve(config=None, host='127.0.0.1', port=8000):
    with make_server(config, host, port) as server:
        print(f'CivMapper: http://127.0.0.1:{server.server_port} (Ctrl+C to stop)', flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
