"""Bounded Civ V replay readers, adapted from MIT-licensed layout code (see NOTICE).

Replay IDs index the replay roster; save event IDs are player slots. Event order
within a turn is significant and is preserved. Unknown types remain raw events.
"""
import hashlib
from pathlib import PurePosixPath
from .save import MAX_INPUT, Reader, ParseError, read_header, find_compression

MAX_EVENTS = 500_000
MAX_TILES = 500_000
MAX_TURN = 100_000


def dimensions(width, height):
    if not (1 <= width <= 1024 and 1 <= height <= 1024 and width*height <= MAX_TILES):
        raise ParseError('invalid replay/map dimensions')


def read_events(r, extra_bytes=0):
    count = r.count(MAX_EVENTS)
    if count*20 > len(r.data)-r.pos:
        raise ParseError('truncated replay event array')
    events = []
    total_tiles = 0
    for index in range(count):
        turn, kind = r.unpack('I'), r.unpack('I')
        if turn > MAX_TURN:
            raise ParseError('replay turn exceeds limit')
        n = r.count(MAX_TILES)
        total_tiles += n
        if total_tiles > 2_000_000:
            raise ParseError('replay event tile budget exceeded')
        coordinates = [{'x': r.unpack('H'), 'y': r.unpack('H')} for _ in range(n)]
        extra = [r.unpack('i') for _ in range(extra_bytes//4)]
        events.append({'turn': turn, 'typeId': kind, 'tiles': coordinates,
                       'civId': r.unpack('i'), 'text': r.string(), 'sequence': index})
        if extra:
            events[-1]['extendedData'] = extra
    return events


def validate_events(events, civs, width=None, height=None, start=0, end=MAX_TURN):
    ids = {c['id'] for c in civs}
    for event in events:
        turn, kind, owner = event['turn'], event['typeId'], event['civId']
        if type(turn) is not int or not start <= turn <= end or type(kind) is not int or kind < 0:
            raise ParseError('invalid replay event turn/type')
        if type(owner) is not int or owner != -1 and owner not in ids:
            raise ParseError('replay event references unknown civilization')
        if kind in (1, 2, 3, 4) and not event['tiles']:
            raise ParseError('political replay event has no tiles')
        if not isinstance(event['text'], str):
            raise ParseError('invalid replay event text')
        for tile in event['tiles']:
            x, y = tile['x'], tile['y']
            if kind in (0, 6) and (x, y) == (65535, 65535):
                continue
            if type(x) is not int or type(y) is not int or x < 0 or y < 0 or (width is not None and (x >= width or y >= height)):
                raise ParseError(f'replay event tile ({x},{y}) outside map')


def result(source, header, civs, events, tiles, datasets=None, inspection=None):
    warnings = ['Replay reconstructs logged ownership/city changes only; historical capitals, alliances, roads and city populations are unavailable.',
                'Physical geography is a snapshot, not a terrain-change history.']
    if tiles is None:
        warnings.append('No physical tile snapshot extracted; a matching base map is required.')
    return {'schemaVersion': '0.1', 'kind': 'replay', 'source': source,
            'extraction': {'status': 'complete', 'fields': {'events': 'extracted',
                'civilizations': 'extracted', 'datasets': 'extracted' if datasets is not None else 'unavailable',
                'tileGeography': 'extracted' if tiles is not None else 'unavailable',
                'historicalCapitals': 'unavailable', 'historicalRoads': 'unavailable'}, 'warnings': warnings},
            'game': header, 'civilizations': civs, 'events': events,
            'datasets': datasets, 'tiles': tiles, 'inspection': inspection or {}}


def _parse_replay(data, extra_bytes):
    if len(data) > MAX_INPUT:
        raise ParseError('replay exceeds input size limit')
    r = Reader(data)
    if r.take(4) != b'CIV5' or r.unpack('I') != 1:
        raise ParseError('unsupported replay file header (requires CIV5/version 1)')
    header = {'gameVersion': r.string(), 'build': r.string(), 'turn': r.unpack('I'), 'modeId': r.unpack('B')}
    for key in ('playerCivilizationKey', 'difficulty', 'startEra', 'endEra', 'speed', 'worldSize', 'mapFilename'):
        header[key] = r.string()
    for _ in range(r.count()):
        r.take(20); r.string()  # DLC UUID, enabled, name
    for _ in range(r.count()):
        r.string(); r.take(4); r.string()
    for key in ('playerCivilizationName', 'playerLeaderName', 'playerColorKey'):
        header[key] = r.string()
    header['replayVersion'] = r.unpack('I')
    header['activePlayerIndex'] = r.unpack('i')
    if header['replayVersion'] != 1:
        raise ParseError(f"unsupported replay version {header['replayVersion']}; requires validated version 1")
    header['mapFilename2'] = r.string()
    for key in ('worldSizeId', 'climateId', 'seaLevelId', 'eraId', 'speedId'):
        header[key] = r.unpack('I')
    header['gameOptions'], header['victoryTypes'] = r.ints(), r.ints()
    header['victoryAchieved'] = r.unpack('i'); r.take(1)
    header['startTurn'], header['startYear'], header['endTurn'] = r.unpack('I'), r.unpack('i'), r.unpack('I')
    if not 0 <= header['startTurn'] <= header['endTurn'] <= MAX_TURN:
        raise ParseError('invalid replay turn range')
    header['endYear'] = r.string(); r.take(8)
    civs = []
    for index in range(r.count(128)):
        civ = {'id': index, 'rulesetId': r.unpack('i'), 'leaderTypeId': r.unpack('i'),
               'playerColorId': r.unpack('i'), 'difficultyId': r.unpack('i')}
        for key in ('leader', 'longName', 'name', 'demonym'):
            civ[key] = r.string()
        civ.update(kind='unknown', color=None, key=civ['name'] if civ['name'].startswith(('CIVILIZATION_', 'MINOR_CIV_')) else None)
        civs.append(civ)
    names = [r.string() for _ in range(r.count(1024))]
    if len(names) != len(set(names)):
        raise ParseError('duplicate replay dataset names')
    datasets = []
    entries = 0
    for index in range(r.count(128)):
        if index >= len(civs) or r.count(1024) != len(names):
            raise ParseError('replay dataset roster/category mismatch')
        values = {}
        for name in names:
            n = r.count(MAX_TURN+1); entries += n
            if entries > 4_000_000:
                raise ParseError('replay dataset budget exceeded')
            points = [{'turn': r.unpack('I'), 'value': r.unpack('I')} for _ in range(n)]
            if any(p['turn'] > MAX_TURN for p in points):
                raise ParseError('invalid dataset turn')
            values[name] = points
        datasets.append({'civId': index, 'values': values})
    r.take(4)
    event_offset = r.pos
    events = read_events(r, extra_bytes)
    width, height = r.unpack('I'), r.unpack('I'); dimensions(width, height)
    if r.count(MAX_TILES) != width*height:
        raise ParseError('replay physical tile count does not match dimensions')
    tiles = []
    for index in range(width*height):
        n = r.count(MAX_TURN+1)
        if n != 1:
            raise ParseError('unsupported replay tile history (requires one snapshot per plot)')
        key = r.unpack('I')
        plot, terrain, feature, rivers = (r.unpack('B') for _ in range(4))
        if plot > 3 or key != header['endTurn']:
            raise ParseError('invalid replay physical snapshot')
        tiles.append({'x': index % width, 'y': index // width, 'plotType': plot,
                      'terrainId': terrain, 'featureId': None if feature == 255 else feature,
                      'riverEdges': [edge for bit, edge in ((4,'E'),(2,'SE'),(8,'SW')) if rivers & bit]})
    if r.pos != len(data):
        raise ParseError(f'unparsed replay trailing bytes: {len(data)-r.pos}')
    header.update(width=width, height=height, wrapX=None, wrapY=None, coordinates='odd-r-bottom-up')
    validate_events(events, civs, width, height, header['startTurn'], header['endTurn'])
    return result({'kind': 'replay', 'sha256': hashlib.sha256(data).hexdigest()}, header, civs, events, tiles,
                  datasets, {'eventsOffset': event_offset, 'parsedEnd': r.pos, 'datasetNames': names,
                             'eventProfile': 'standard' if not extra_bytes else 'lek-extended-12'})


def parse_replay(data):
    candidates, errors = [], []
    for extra in (0,12):
        try:
            candidate=_parse_replay(data,extra)
            candidate['inspection']['headerProfile']='versioned-1'
            if not candidate['events']:
                candidate['inspection']['eventProfile']='no-events'
                if candidates and not candidates[0]['events']:continue
            candidates.append(candidate)
        except ParseError as exc:
            errors.append(str(exc))
    if len(candidates) != 1:
        raise ParseError('expected one validated replay profile: ' + '; '.join(errors))
    return candidates[0]


def _save_events(state, timer_bytes, extra_bytes):
    """Sequential supported game-state header, through random-state/event records.

    No event-signature scan: unknown headers and nonempty vote lists fail.
    """
    r = Reader(state)
    version = r.unpack('I')
    if version != 1:
        raise ParseError(f'unsupported embedded replay state version {version}; requires validated version 1')
    r.take(29*4)
    r.take(timer_bytes)
    flags = r.take(10)
    if any(b > 1 for b in flags):
        raise ParseError('invalid game-state header flags')
    r.strings()  # advisor messages viewed
    r.take(12*4)
    r.string()  # script data
    r.take(7*64*4)
    # Created-count arrays and world-congress maps.
    for _ in range(8):
        for _ in range(r.count(100_000)):
            if r.unpack('I'):
                r.take(4)
    r.take(3*63*4)
    for _ in range(r.count(100_000)):
        key = r.unpack('I')
        if key and r.unpack('B') > 1:
            raise ParseError('invalid special-unit flag')
    for _ in range(r.count(100_000)):
        if r.unpack('I'):
            r.take(4*5)  # team victory rank, five awards
    r.strings()  # destroyed cities
    r.strings()  # great people
    for _ in range(2):
        slots = r.unpack('i')
        if not 0 <= slots <= 100_000:
            raise ParseError('invalid vote free-list capacity')
        r.take(4*4+slots*4)
        if r.count() != 0:
            raise ParseError('nonempty vote free-list unsupported for embedded replay')
    for _ in range(2):
        if r.unpack('I') != 1:
            raise ParseError('unsupported random-state version')
        r.take(12)
        if r.unpack('B') != 0:
            raise ParseError('extended random debugging unsupported')
    message_version = r.unpack('I')
    if message_version not in (1,2):
        raise ParseError('unsupported embedded replay message version')
    offset = r.pos
    events = read_events(r, extra_bytes)
    return events, {'stateVersion': version, 'messageVersion':message_version,'eventsOffset': offset, 'eventsEnd': r.pos,
                    'timerBytes':timer_bytes,'eventProfile':'standard' if not extra_bytes else 'lek-extended-12'}


def save_events(state):
    candidates, errors = [], []
    for timer_bytes, extra_bytes in ((0,0),(5,0),(9,0),(9,12)):
        try:
            candidate = _save_events(state,timer_bytes,extra_bytes)
            # The next section is the plot-extra-yield array. Corroborate its
            # record shape and bounds instead of accepting an event-only scan.
            r = Reader(state,candidate[1]['eventsEnd'])
            sessions=r.unpack('i')
            if not 0<=sessions<=1_000_000:raise ParseError('invalid post-replay session count')
            for _ in range(r.count(100_000)):
                x,y,n = r.unpack('i'),r.unpack('i'),r.count(32)
                if not 0 <= x < 1024 or not 0 <= y < 1024:
                    raise ParseError('invalid post-replay plot coordinate')
                r.take(n*4)
            if not candidate[0]:
                candidate[1]['eventProfile']='no-events'
                if any(not c[0] and c[1]['eventsEnd']==candidate[1]['eventsEnd'] for c in candidates):continue
            candidates.append(candidate)
        except ParseError as exc:
            errors.append(str(exc))
    if len(candidates)!=1:
        raise ParseError('expected one validated embedded replay profile: '+'; '.join(errors))
    return candidates[0]


def parse_save_replay(data):
    if len(data) > MAX_INPUT:
        raise ParseError('save exceeds input size limit')
    header, civs = read_header(data, include_player_names=True)
    state, compression = find_compression(data, header['parsedHeaderEnd'])
    events, inspection = save_events(state)
    validate_events(events, civs, end=header['turn'])
    header.update(startTurn=int.from_bytes(state[12:16], 'little'), endTurn=header['turn'],
                  width=None, height=None, wrapX=None, wrapY=None, coordinates='odd-r-bottom-up',
                  mapFilename=header['mapScript'])
    # Complete geography extraction is independent and optional: events can still
    # be exported if a plot profile is unsupported, to animate with a base map.
    from .extract import extract_bytes
    try:
        world = extract_bytes(data)
    except ParseError as exc:
        world = None; inspection['geographyError'] = str(exc)
    tiles = None
    if world:
        header.update({k: world['game'][k] for k in ('width','height','wrapX','wrapY')})
        tiles = [{k:v for k,v in t.items() if k in ('x','y','landWater','elevation','terrain','terrainId','feature','featureHash','riverEdges')} for t in world['tiles']]
        # Event IDs are slots; use the expanded minor roster rather than only
        # setup major keys, which can omit minor names.
        by_id = {c['id']:c for c in world['civilizations']}
        for c in civs:
            if c['id'] in by_id: by_id[c['id']].update({k:v for k,v in c.items() if k=='playerName'})
        civs = list(by_id.values())
        for c in civs:
            for k in ('ally','allianceKnown','allianceSinceTurn','allianceEvidence','capitalKnown','capitalCityId','capitalEvidence'):
                c.pop(k,None)
        validate_events(events,civs,header['width'],header['height'],header['startTurn'],header['endTurn'])
    inspection['compression'] = compression
    return result({'kind':'save','sha256':hashlib.sha256(data).hexdigest()}, header,civs,events,tiles,inspection=inspection)


def map_stem(filename):
    return PurePosixPath(filename.replace('\\','/')).stem.casefold()
