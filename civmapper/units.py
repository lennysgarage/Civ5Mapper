"""Opt-in current plot-referenced units, with narrowly validated v9 profiles.

Prefix order and archive tail follow SDK CvUnit.h/CvUnit.cpp. String offsets
are empirical for the two tested DLL families, not a generic archive decoder.
Uninterpreted archive bytes never acquire invented field meanings.
"""
import struct
from .save import Reader, ParseError
from .diplomacy import player_anchors

UNIT_PROFILES = {'bnw-six-yield': 507, 'observed-seven-yield': 931}


def read_unit(state, offset, limit, reference, tile, profile):
    r = Reader(memoryview(state)[:limit], offset)
    if r.unpack('I') != 9:
        raise ParseError('unsupported unit version; requires validated v9')
    owner, original, type_id, x, y, local_id = [r.unpack('i') for _ in range(6)]
    if (owner, local_id, x, y) != (reference['owner'], reference['localId'], tile['x'], tile['y']):
        raise ParseError('unit identity/coordinate mismatch')
    if not 0 <= original < 64 or not 0 <= type_id <= 100000:
        raise ParseError('invalid unit identity/type')
    r.take(UNIT_PROFILES[profile] - 28)
    legacy_name = r.string()
    if len(legacy_name) > 256 or any(not c.isprintable() for c in legacy_name):
        raise ParseError('invalid unit archive legacy name')
    r.string() # script data; not used as a unit name or game-state fact
    sizes = []
    for _ in range(10):
        count = r.count(4096)
        if not count:
            raise ParseError('empty unit terrain/feature/combat/class vector')
        sizes.append(count)
        r.take(count * 4)
    if not (sizes[0] == sizes[2] == sizes[4] == sizes[5] and
            sizes[1] == sizes[3] == sizes[6] == sizes[7]):
        raise ParseError('unit archive vector dimensions disagree')
    r.take(24) # six final archive scalars, including mission/activity/AI enums
    hash_offset = r.pos
    type_hash = r.unpack('I')
    if not type_hash:
        raise ParseError('missing serialized unit type hash')
    r.take(4) # last move data is not interpreted
    if r.unpack('I') != 1:
        raise ParseError('unsupported unit promotions version')
    total = r.count(4096)
    if not total:
        raise ParseError('invalid unit promotion capacity')
    count = r.count(total)
    hashes = set()
    for _ in range(count):
        promotion = r.unpack('I')
        active = r.unpack('B')
        if not promotion or promotion in hashes or active != 1:
            raise ParseError('invalid active unit promotion entry')
        hashes.add(promotion)
    return {'id': f'{owner}:{local_id}', 'localId': local_id, 'owner': owner,
            'x': x, 'y': y, 'unitTypeId': type_id, 'unitTypeHash': f'{type_hash:08x}',
            'type': None, 'name': None, 'domain': None, 'isMilitary': None,
            'classificationKnown': False,
            'evidence': {'offset': offset, 'typeHashOffset': hash_offset,
                         'validatedThroughOffset': r.pos, 'unitVersion': 9,
                         'archiveStringOffset': UNIT_PROFILES[profile], 'vectorSizes': sizes}}


def extract_units(world, state, profile):
    plots = world['inspection']['plots']
    references = [(tile, ref) for tile, record in zip(world['tiles'], plots['records'])
                  for ref in record['unitReferences']]
    if len(references) > 100000:
        raise ParseError('current unit reference budget exceeded')
    identities = [(ref['owner'], ref['localId']) for tile, ref in references]
    if len(set(identities)) != len(identities):
        raise ParseError('unit referenced on multiple plots')
    roster = {c['id'] for c in world['civilizations']}
    if any(ref['owner'] not in roster for tile, ref in references):
        raise ParseError('plot unit owner absent from roster')
    units = []
    if references:
        anchors = player_anchors(state, plots['endOffset'],
                                 6 if profile == 'bnw-six-yield' else 7, world['cities'])
        for tile, ref in references:
            owner = ref['owner']
            lo = anchors[owner]['endOffset']
            hi = anchors[owner+1]['offset'] if owner < 63 else len(state)
            signature = struct.pack('<3i', tile['x'], tile['y'], ref['localId'])
            candidates, pos = [], lo
            while (pos := state.find(signature, pos, hi)) >= 0:
                offset = pos - 16
                if offset >= lo:
                    try:
                        candidates.append(read_unit(state, offset, hi, ref, tile, profile))
                    except ParseError:
                        pass
                pos += 1
            if len(candidates) != 1:
                raise ParseError(f"unit {owner}:{ref['localId']} has {len(candidates)} validated v9 records; unknown/ambiguous unit layout")
            units.append(candidates[0])
    world['units'] = sorted(units, key=lambda u: (u['owner'], u['localId']))
    world['extraction']['fields'].update(unitPositions='extracted', unitTypes='partial', militaryClassification='unavailable')
    world['extraction']['warnings'].append('Unit coverage is current plot references; off-map/trade-manager units are not traversed. Unit types and military classification require matching ruleset hashes.')
