"""Bounded partial parser. Layouts adapted from MIT-licensed layout code; see NOTICE.

Only the initial header is parsed sequentially. Compression and map-header
discovery use validated anchors, not a complete traversal of game state.
"""
import hashlib
import struct
import zlib

MAX_INPUT = 64 * 1024 * 1024
MAX_OUTPUT = 128 * 1024 * 1024
SQLITE_MAGIC = b"SQLite format 3\0"


class ParseError(ValueError):
    pass


class Reader:
    def __init__(self, data, offset=0):
        self.data, self.pos = data, offset

    def take(self, count):
        if count < 0 or self.pos + count > len(self.data):
            raise ParseError(f"truncated field at byte {self.pos} (needs {count} bytes)")
        value = self.data[self.pos:self.pos + count]
        self.pos += count
        return value

    def unpack(self, fmt):
        return struct.unpack('<' + fmt, self.take(struct.calcsize('<' + fmt)))[0]

    def string(self):
        size = self.unpack('I')
        if size > 1_000_000:
            raise ParseError(f"string too large at byte {self.pos - 4}")
        try:
            return bytes(self.take(size)).decode('utf-8')
        except UnicodeDecodeError as exc:
            raise ParseError(f"invalid UTF-8 at byte {self.pos - size}") from exc

    def count(self, limit=4096):
        count = self.unpack('I')
        if count > limit:
            raise ParseError(f"array count {count} exceeds {limit}")
        return count

    def strings(self):
        return [self.string() for _ in range(self.count())]

    def ints(self):
        return [self.unpack('i') for _ in range(self.count())]


def display_player_name(raw):
    """Use the game's display-name suffix rule without exporting account IDs."""
    pos = raw.rfind('@')
    if 0 < pos < 64 and len(raw) - pos < 32:
        raw = raw[:pos]
    if not raw:
        return None
    if len(raw) > 256 or any(not c.isprintable() for c in raw):
        raise ParseError('invalid player display name')
    return raw


def read_header(data, include_player_names=False):
    r = Reader(data)
    if r.take(4) != b'CIV5':
        raise ParseError('expected CIV5 signature')
    version = r.unpack('I')
    if version != 8:
        raise ParseError(f'unsupported save header version {version}; prototype supports version 8')
    header = {'saveVersion': version, 'gameVersion': r.string(), 'build': r.string(),
              'turn': r.unpack('I'), 'modeId': r.unpack('B')}
    header['mode'] = {0: 'singleplayer', 1: 'multiplayer', 2: 'hotseat'}.get(header['modeId'], 'unknown')
    for key in ('playerCivilizationKey', 'difficulty', 'startEra', 'currentEra',
                'speed', 'worldSize', 'mapScript'):
        header[key] = r.string()
    header['dlc'] = []
    for _ in range(r.count()):
        identifier = r.take(16).hex()
        header['dlc'].append({'idBytes': identifier, 'enabledRaw': r.unpack('I'), 'name': r.string()})
    header['mods'] = []
    for _ in range(r.count()):
        header['mods'].append({'id': r.string(), 'version': r.unpack('I'), 'name': r.string()})
    for key in ('playerCivilizationName', 'playerLeaderName', 'playerColorKey'):
        header[key] = r.string()
    r.take(16)
    header['versionString2'] = r.string()
    r.take(16)
    r.take(4)
    slot_version = r.unpack('I')
    header['slotHintsVersion'] = slot_version
    header['speedId'], header['worldSizeId'] = r.unpack('I'), r.unpack('I')
    header['mapScript2'] = r.string()
    arrays = {}
    for key in ('civilizationIds', 'nicknames', 'slotStatuses', 'slotClaims', 'teams', 'handicaps'):
        arrays[key] = r.strings() if key == 'nicknames' else r.ints()
    keys = r.strings() if slot_version >= 3 else []
    leaders = r.strings() if slot_version >= 3 else []
    header['preGameFormatVersion'] = r.unpack('I')
    header['parsedHeaderEnd'] = r.pos
    roster = []
    for slot, key in enumerate(keys):
        if not key:
            continue
        civ = {'id': slot, 'key': key, 'name': None, 'kind': 'unknown',
               'color': None, 'colorKey': None, 'eliminated': None}
        if slot < len(leaders):
            civ['leaderKey'] = leaders[slot]
        for src, dst in (('civilizationIds', 'rulesetId'), ('slotStatuses', 'setupSlotStatus'), ('teams', 'teamId')):
            if slot < len(arrays[src]):
                civ[dst] = arrays[src][slot]
        if include_player_names and header['modeId'] in (1, 2):
            raw = arrays['nicknames'][slot] if slot < len(arrays['nicknames']) else ''
            civ['playerName'] = display_player_name(raw)
        roster.append(civ)
    # Account IDs are never exported; display nicknames require explicit inclusion.
    return header, roster


def inflate(data, start, max_output=MAX_OUTPUT):
    decoder = zlib.decompressobj()
    try:
        result = decoder.decompress(data[start:], max_output + 1)
    except zlib.error as exc:
        raise ParseError(f'invalid compressed data at byte {start}: {exc}') from exc
    if len(result) > max_output or decoder.unconsumed_tail:
        raise ParseError(f'decompressed data exceeds {max_output} bytes')
    return result, decoder.eof, len(decoder.unused_data)


def find_compression(data, minimum, max_output=MAX_OUTPUT):
    # uint32 format, then repeated uint32 compressed-length + compressed bytes.
    # Length words MUST be removed before inflation (even if raw zlib accepts them).
    candidates = []
    for fmt in (1, 2):
        marker = struct.pack('<I', fmt)
        start = minimum
        while (pos := data.find(marker, start)) >= 0:
            start = pos + 1
            if pos + 10 > len(data):
                continue
            size = struct.unpack_from('<I', data, pos + 4)[0]
            cmf, flg = data[pos + 8:pos + 10]
            if 2 <= size <= 65536 and cmf == 0x78 and ((cmf << 8) + flg) % 31 == 0 and not flg & 32:
                candidates.append((pos + 8, fmt))
            if len(candidates) > 16:
                raise ParseError('too many compression candidates')
    if len(candidates) != 1:
        raise ParseError(f'expected one compression anchor, found {len(candidates)}')
    offset, fmt = candidates[0]
    r = Reader(data, offset - 4)
    chunks, sizes = [], []
    while r.pos < len(data):
        size = r.unpack('I')
        if not 1 <= size <= 65536:
            raise ParseError(f'invalid compressed chunk length {size} at byte {r.pos - 4}')
        chunks.append(r.take(size))
        sizes.append(size)
    state, eof, trailing = inflate(b''.join(chunks), 0, max_output)
    if len(state) < 24:
        raise ParseError('compressed state too short')
    return state, {'offset': offset, 'format': fmt, 'maxChunkSize': 65536,
                   'chunkCount': len(sizes), 'lastChunkBytes': sizes[-1],
                   'bytes': len(state), 'endMarkerPresent': eof, 'trailingBytes': trailing,
                   'sha256': hashlib.sha256(state).hexdigest()}


def read_map_header(state, offset):
    r = Reader(state, offset)
    version = r.unpack('I')
    if version != 1:
        raise ParseError(f'unsupported map header version {version}')
    result = {'version': version}
    for key in ('width', 'height', 'landPlots', 'ownedPlots', 'naturalWonders', 'topLatitude', 'bottomLatitude'):
        result[key] = r.unpack('i')
    w, h = result['width'], result['height']
    if not (1 <= w <= 1024 and 1 <= h <= 1024 and w * h <= 500_000):
        raise ParseError('implausible map dimensions')
    if any(not 0 <= result[k] <= w * h for k in ('landPlots', 'ownedPlots', 'naturalWonders')):
        raise ParseError('invalid map aggregate counts')
    if not (-90 <= result['bottomLatitude'] <= result['topLatitude'] <= 90):
        raise ParseError('invalid map latitudes')
    for key in ('wrapX', 'wrapY'):
        flag = r.unpack('B')
        if flag not in (0, 1):
            raise ParseError('invalid wrapping flag')
        result[key] = bool(flag)
    result['guidBytes'] = r.take(16).hex()
    for key in ('resourceCounts', 'resourceCountsOnLand'):
        values = []
        for _ in range(r.count()):
            type_hash = r.unpack('I')
            count = r.unpack('i') if type_hash else None
            if count is not None and count < 0:
                raise ParseError('negative resource count')
            values.append({'typeHash': f'{type_hash:08x}', 'count': count})
        result[key] = values
    result['offset'], result['endOffset'] = offset, r.pos
    return result


def find_map_header(state):
    candidates = []
    start = 4
    while (pos := state.find(SQLITE_MAGIC, start)) >= 0:
        start = pos + 1
        size = struct.unpack_from('<I', state, pos - 4)[0]
        if not (512 <= size <= 100 * 1024 * 1024 and pos + size + 58 <= len(state)):
            continue
        # SQLite header page size and page count corroborate the blob boundary.
        page_size = struct.unpack_from('>H', state, pos + 16)[0]
        page_size = 65536 if page_size == 1 else page_size
        pages = struct.unpack_from('>I', state, pos + 28)[0]
        if page_size < 512 or page_size & (page_size - 1) or pages * page_size != size:
            continue
        try:
            header = read_map_header(state, pos + size)
        except ParseError:
            continue
        candidates.append((header, {'offset': pos, 'bytes': size}))
    if len(candidates) != 1:
        raise ParseError(f'expected one SQLite/map-header anchor, found {len(candidates)}')
    return candidates[0]


def inspect_bytes(data, max_output=MAX_OUTPUT, include_player_names=False, diagnostics=False):
    if len(data) > MAX_INPUT:
        raise ParseError(f'input exceeds {MAX_INPUT} bytes')
    header, roster = read_header(data, include_player_names)
    state, compression = find_compression(data, header['parsedHeaderEnd'], max_output)
    warnings = ['Current tile and city records are not decoded. This is not a renderable world.',
                'Map header located using a validated SQLite anchor; intervening game sections are not parsed.',
                'Roster IDs are setup player slots, not replay civilization indexes; city-state roster is incomplete.']
    if not compression['endMarkerPresent']:
        warnings.append('Zlib end marker absent: common in Civ V saves, but truncation cannot be ruled out.')
    map_header, database = None, None
    try:
        map_header, database = find_map_header(state)
    except ParseError as exc:
        warnings.append(str(exc))
    game = {'turn': header['turn'], 'width': None, 'height': None, 'wrapX': None, 'wrapY': None,
            'coordinates': 'odd-r-bottom-up'}
    if map_header:
        game.update({k: map_header[k] for k in ('width', 'height', 'wrapX', 'wrapY')})
    fields = {k: 'unavailable' for k in ('tileCoordinates', 'landWater', 'tileOwnership', 'cities',
              'terrain', 'features', 'rivers', 'capitals', 'civilizationColors', 'historicalOwnership')}
    fields.update(turn='extracted', civilizationIds='partial', civilizationNames='partial',
                  mapDimensions='extracted' if map_header else 'unavailable',
                  wrapping='extracted' if map_header else 'unavailable')
    result = {'schemaVersion': '0.1', 'source': {'kind': 'save', 'sha256': hashlib.sha256(data).hexdigest()},
              'extraction': {'status': 'partial', 'fields': fields, 'warnings': warnings},
              'game': game, 'civilizations': roster, 'tiles': None, 'cities': None,
              'inspection': {'header': header, 'compression': compression, 'mapHeader': map_header,
                             'embeddedDatabase': database,
                             'stateVersion': struct.unpack_from('<I', state)[0],
                             'elapsedTurns': struct.unpack_from('<I', state, 8)[0]}}
    if diagnostics:
        from .diagnostics import layout_diagnostics
        result['inspection']['layoutDiagnostics']=layout_diagnostics(state,map_header)
    return result, state
