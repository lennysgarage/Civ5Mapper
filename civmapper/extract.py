"""Current-state extraction with validated, explicitly limited layout profiles.

Vanilla layout follows SDK serialization evidence. The seven-yield profile is
empirical, validated against a local modpack corpus; it is not a general custom
DLL decoder. Unnamed fields are skipped, never given invented meanings.
"""
import struct
import zlib

from .save import ParseError, Reader, inspect_bytes

PROFILES = {
    'bnw-six-yield': {'ownerOffset': 55, 'routePillageOffset': 50, 'yields': 6, 'cityScalars': 66,
                      'cityOwnerPadding': 4, 'cityYieldVectors': 16, 'cityNamePadding': 0},
    'observed-seven-yield': {'ownerOffset': 57, 'routePillageOffset': 50, 'yields': 7, 'cityScalars': 58,
                             'cityOwnerPadding': 0, 'cityYieldVectors': 18, 'cityNamePadding': 5},
}
FEATURE_KEYS = ('FEATURE_ICE', 'FEATURE_FOREST', 'FEATURE_JUNGLE', 'FEATURE_MARSH',
                'FEATURE_OASIS', 'FEATURE_FLOOD_PLAINS', 'FEATURE_FALLOUT')
FEATURE_HASHES = {zlib.crc32(key.encode()) ^ 0xffffffff: key for key in FEATURE_KEYS}


def read_plot(r, profile):
    start = r.pos
    if r.unpack('I') != 7:
        raise ParseError(f'unsupported plot version at byte {start}')
    x, y = r.unpack('h'), r.unpack('h')
    pillaged = r.data[start + profile['routePillageOffset']] if start + profile['routePillageOffset'] < len(r.data) else -1
    river_flags = r.data[start+45:start+48]
    if len(river_flags)!=3 or any(b not in (0,1) for b in river_flags):
        raise ParseError('invalid river presence flags')
    if pillaged not in (0, 1):
        raise ParseError('invalid route pillage flag')
    r.take(profile['ownerOffset'] - 8)
    owner, plot, terrain = [r.unpack('b') for _ in range(3)]
    feature, resource, improvement, construction = [r.unpack('I') for _ in range(4)]
    r.take(4)  # improvement/route maintenance players and camp-clearing player
    route = r.unpack('b')
    if not -1 <= route <= 127:
        raise ParseError('invalid route ID')
    r.take(2)  # world-anchor bytes
    flows = [r.unpack('b') for _ in range(3)]
    city_owner, city_id = r.unpack('i'), r.unpack('i')
    r.take(32)  # four more city references
    r.take(profile['yields'] * 2 + 320 + 80)
    visibility_counts = [r.unpack('h') for _ in range(80)]
    r.take(80 + 1)
    revealed = int.from_bytes(r.take(16), 'little')
    r.take(80 + 320 + 160 + 22)
    script = r.unpack('B')
    if script not in (0, 1):
        raise ParseError(f'invalid script flag at byte {r.pos-1}')
    if script:
        r.string()
    builds = r.count()
    if builds:
        entries = r.count()
        if entries != builds:
            raise ParseError('build-array size mismatch')
        for _ in range(entries):
            if r.unpack('I'):
                r.take(2)
    r.take(160)  # fixed invisible-visibility array
    units = r.count(4096)
    unit_references = [{'owner': r.unpack('i'), 'localId': r.unpack('i')} for _ in range(units)]
    if any(not 0 <= u['owner'] < 64 or u['localId'] < 0 for u in unit_references):
        raise ParseError('invalid plot unit reference')
    if len({(u['owner'],u['localId']) for u in unit_references}) != units:
        raise ParseError('duplicate plot unit reference')
    r.take(1)  # continent art classification
    arch = r.unpack('I')
    if arch not in (1, 2):
        raise ParseError(f'unsupported archaeology version {arch}')
    r.take(20 if arch == 2 else 16)
    if not (-1 <= owner < 64 and 0 <= plot <= 3 and -1 <= terrain <= 127):
        raise ParseError(f'invalid plot enums at ({x}, {y})')
    if any(flow not in range(-1, 6) for flow in flows):
        raise ParseError('invalid river flow direction')
    if (city_owner == -1) != (city_id == -1) or not -1 <= city_owner < 64:
        raise ParseError('invalid plot city reference')
    tile = {'x': x, 'y': y, 'landWater': 'water' if plot == 3 else 'land',
            'owner': None if owner == -1 else owner, 'ownershipKnown': True,
            'elevation': {0: 'mountain', 1: 'hills', 2: 'flat', 3: 'flat'}[plot],
            'terrain': None, 'terrainId': terrain,
            'featureHash': f'{feature:08x}' if feature else None,
            'resourceHash': f'{resource:08x}' if resource else None,
            'routeKnown': True, 'routeId': None if route == -1 else route,
            'route': None, 'routePillaged': bool(pillaged),
            'riverEdges': [edge for flag,edge in zip(river_flags,('SW','E','SE')) if flag],
            'riverFlowDirections': dict(zip(('E', 'SE', 'SW'), flows)),
            'isLake': None,
            'visibility': {str(i): 'visible' if visibility_counts[i] > 0 else
                           'revealed' if revealed & (1 << i) else 'unrevealed' for i in range(64)}}
    if feature == 0 or feature in FEATURE_HASHES:
        tile['feature'] = FEATURE_HASHES.get(feature)
    if city_owner != -1:
        if city_owner != owner or plot == 3:
            raise ParseError('plot city ownership/geography mismatch')
        tile['cityReference'] = {'owner': city_owner, 'localId': city_id}
    return tile, {'offset': start, 'endOffset': r.pos, 'unitReferences': unit_references}


def read_plots(state, header, profile):
    r = Reader(state, header['endOffset'])
    tiles, records = [], []
    for index in range(header['width'] * header['height']):
        tile, record = read_plot(r, profile)
        if (tile['x'], tile['y']) != (index % header['width'], index // header['width']):
            raise ParseError(f'plot coordinate/order mismatch at index {index}')
        tiles.append(tile)
        records.append(record)
    if sum(t['landWater'] == 'land' for t in tiles) != header['landPlots']:
        raise ParseError('land aggregate mismatch')
    if sum(t['owner'] is not None for t in tiles) != header['ownedPlots']:
        raise ParseError('ownership aggregate mismatch')
    return tiles, {'offset': header['endOffset'], 'endOffset': r.pos, 'records': records}


def read_city_candidate(state, offset, profile, tile):
    r = Reader(state, offset)
    if r.unpack('I') != 6:
        raise ParseError('unsupported city version')
    scalars = [r.unpack('i') for _ in range(profile['cityScalars'])]
    ref = tile['cityReference']
    if scalars[:3] != [ref['localId'], tile['x'], tile['y']]:
        raise ParseError('city ID/coordinate mismatch')
    flags = r.take(10)
    if any(v not in (0, 1) for v in flags):
        raise ParseError('invalid city flag')
    if r.unpack('i') != ref['owner']:
        raise ParseError('city owner mismatch')
    r.take(12 + profile['cityOwnerPadding'])
    for _ in range(profile['cityYieldVectors']):
        count = r.count()
        if count != profile['yields']:
            raise ParseError('city yield-vector size mismatch')
        r.take(count * 4)
    for _ in range(2):
        count = r.count()
        if count != 5:
            raise ParseError('city domain-vector size mismatch')
        r.take(count * 4)
    for _ in range(2):
        count = r.count()
        if count != 80:
            raise ParseError('city player/team-vector size mismatch')
        if any(v not in (0, 1) for v in r.take(count)):
            raise ParseError('invalid city player/team flag')
    r.take(profile['cityNamePadding'])
    name = r.string()
    if not 1 <= len(name) <= 256 or any(not c.isprintable() for c in name):
        raise ParseError('invalid city name')
    if not 1 <= scalars[7] <= 10000:
        raise ParseError('invalid city population')
    return {'id': f"{ref['owner']}:{ref['localId']}", 'localId': ref['localId'],
            'x': tile['x'], 'y': tile['y'], 'owner': ref['owner'], 'population': scalars[7],
            'name': name, 'nameKey': name if name.startswith('TXT_KEY_') else None,
            'capital': None, 'evidence': {'offset': offset, 'nameEndOffset': r.pos}}


def read_cities(state, tiles, minimum, profile):
    cities = []
    for tile in tiles:
        if 'cityReference' not in tile:
            continue
        ref = tile['cityReference']
        signature = struct.pack('<Iiii', 6, ref['localId'], tile['x'], tile['y'])
        candidates, pos = [], minimum
        while (pos := state.find(signature, pos)) >= 0:
            try:
                candidates.append(read_city_candidate(state, pos, profile, tile))
            except ParseError:
                pass
            pos += 1
        if len(candidates) != 1:
            raise ParseError(f"city {ref['owner']}:{ref['localId']} has {len(candidates)} valid current-state candidates")
        cities.append(candidates[0])
    expected = struct.unpack_from('<i', state, 40)[0]
    if len(cities) != expected:
        raise ParseError(f'city aggregate mismatch: decoded {len(cities)}, header {expected}')
    if len({c['id'] for c in cities}) != len(cities):
        raise ParseError('duplicate city identity')
    return cities


def extract_bytes(data, profile_name='auto', include_player_names=True, *, include_units=False):
    world, state = inspect_bytes(data, include_player_names=include_player_names)
    header = world['inspection']['mapHeader']
    if world['game']['turn'] != world['inspection']['elapsedTurns']:
        raise ParseError('setup/state turn mismatch')
    if header is None or world['inspection']['stateVersion'] != 1:
        raise ParseError('extraction requires a supported BNW map and game-state header')
    names = list(PROFILES) if profile_name == 'auto' else [profile_name]
    matches, errors = [], []
    for name in names:
        if name not in PROFILES:
            raise ParseError(f'unknown profile {name}')
        try:
            tiles, diagnostics = read_plots(state, header, PROFILES[name])
            matches.append((name, tiles, diagnostics))
        except ParseError as exc:
            errors.append(f'{name}: {exc}')
    if len(matches) != 1:
        raise ParseError('expected exactly one validated plot layout: ' + '; '.join(errors))
    name, tiles, diagnostics = matches[0]
    cities = read_cities(state, tiles, diagnostics['endOffset'], PROFILES[name])
    world['tiles'], world['cities'] = tiles, cities
    world['inspection']['plots'] = diagnostics
    world['inspection']['profile'] = name
    roster = {c['id']: c for c in world['civilizations']}
    setup = data[:world['inspection']['compression']['offset'] - 8]
    arrays = {}
    # Two tagged 64-slot string arrays can be identified without traversing
    # private account/password settings. Reject ambiguity rather than guessing.
    for prefix in ('PLAYERCOLOR_', 'MINOR_CIV_'):
        candidates, pos = [], world['inspection']['header']['parsedHeaderEnd']
        marker = struct.pack('<I', 64)
        while (pos := setup.find(marker, pos)) >= 0:
            try:
                values = Reader(setup, pos).strings()
                present = [value for value in values if value]
                if present and all(value.startswith(prefix) for value in present):
                    candidates.append(values)
            except ParseError:
                pass
            pos += 1
        if len(candidates) == 1:
            arrays[prefix] = candidates[0]
        elif len(candidates) > 1:
            raise ParseError(f'ambiguous {prefix} setup array')
    for tile in tiles:
        owner = tile['owner']
        if owner is not None and owner not in roster:
            raise ParseError(f'owner {owner} missing from setup roster')
    for civ in roster.values():
        civ['kind'] = ('city-state' if civ['key'] == 'CIVILIZATION_MINOR' else
                       'barbarian' if civ['key'] == 'CIVILIZATION_BARBARIAN' else 'major')
        if 'PLAYERCOLOR_' in arrays:
            civ['colorKey'] = arrays['PLAYERCOLOR_'][civ['id']] or None
        if 'MINOR_CIV_' in arrays and arrays['MINOR_CIV_'][civ['id']]:
            civ['minorKey'] = arrays['MINOR_CIV_'][civ['id']]
    world['extraction']['status'] = 'complete'
    fields = world['extraction']['fields']
    fields.update(tileCoordinates='extracted', landWater='extracted', tileOwnership='extracted',
                  cities='extracted', features='partial', terrain='partial', rivers='extracted',
                  capitals='unavailable', civilizationColors='partial')
    world['extraction']['warnings'] = [
        'Experimental layout profile; supported-save extraction, not arbitrary Civ V compatibility.',
        'Map location and city records use validated anchors; player serialization is not fully traversed.',
        'City labels may be localization keys; lake status and elimination remain unknown.',
        'Terrain IDs and unresolved feature hashes need the matching ruleset; presentation colors may be defaults.',
    ]
    if not world['inspection']['compression']['endMarkerPresent']:
        world['extraction']['warnings'].append('Zlib end marker absent; decoded grid and city aggregates passed, later sections not validated.')
    from .diplomacy import add_alliances
    add_alliances(world, state, PROFILES[name]['yields'])
    from .capitals import add_capitals
    add_capitals(world, state, name)
    fields['routes'] = 'partial' if any(t['routeId'] is not None for t in tiles) else 'extracted'
    fields['roadConnections'] = 'extracted'
    fields['playerNames'] = 'partial' if any(c.get('playerName') for c in roster.values()) else 'unavailable'
    if include_units:
        from .units import extract_units
        extract_units(world, state, name)
    return world
