"""Bounded current alliance decoding for the two supported save profiles.

Validated player identity/yield anchors establish ownership of MinorCivAI
records. No relationship is inferred from influence, replay or map position.
Unsupported or ambiguous optional records remain unknown.
"""
import struct
from .save import Reader, ParseError


def boolean_bytes(r, count):
    values = r.take(count)
    if any(v not in (0, 1) for v in values):
        raise ParseError('invalid diplomacy boolean array')
    return values


def player_anchors(state, minimum, yields, cities):
    marker = struct.pack('<I', yields)
    anchors, pos = [], minimum
    while (pos := state.find(marker, pos)) >= 0:
        try:
            if pos - 32 < minimum:
                raise ParseError('player identity before map end')
            r = Reader(state, pos-32)
            boolean_bytes(r, 11)
            founded = r.unpack('i')
            boolean_bytes(r, 3)
            conqueror = r.unpack('i')
            boolean_bytes(r, 2)
            owner = r.unpack('i')
            r.take(4)  # personality/leader identifier
            if not 0 <= owner < 64 or not 0 <= founded <= 10000 or not -1 <= conqueror < 64:
                raise ParseError('invalid player identity')
            for _ in range(10):
                if r.unpack('I') != yields:
                    raise ParseError('invalid player yield-vector size')
                r.take(yields*4)
            anchors.append({'id': owner, 'offset': pos-32, 'endOffset': r.pos})
        except ParseError:
            pass
        pos += 1
    # The supported format serializes all 64 slots in ascending order.
    if [a['id'] for a in anchors] != list(range(64)):
        raise ParseError('expected unique ordered player identity anchors for all 64 slots')
    for city in cities:
        owner = city['owner']
        lo = anchors[owner]['endOffset']
        hi = anchors[owner+1]['offset'] if owner < 63 else len(state)
        if not lo <= city['evidence']['offset'] < city['evidence']['nameEndOffset'] <= hi:
            raise ParseError('city record conflicts with player identity interval')
    return anchors


def read_minor_ai(state, offset, limit, turn, extra_arrays):
    # Crop to the owning player's interval so a candidate cannot consume later players.
    r = Reader(memoryview(state)[:limit], offset)
    if r.unpack('I') != 1:
        raise ParseError('unsupported MinorCivAI version')
    personality, status = r.unpack('i'), r.unpack('i')
    r.take(4)  # unique unit identifier
    threatened, countdown, ally, since, bought = [r.unpack('i') for _ in range(5)]
    if personality not in range(-1, 4) or status not in range(-1, 3):
        raise ParseError('invalid minor personality/status')
    if not -1 <= threatened <= 100000 or not -1 <= countdown <= 100000:
        raise ParseError('invalid minor counter')
    if not -1 <= ally < 22 or not -1 <= bought < 22 or not -1 <= since <= turn:
        raise ParseError('invalid alliance reference/turn')
    if ally != -1 and since < 0:
        raise ParseError('alliance has no start turn')
    boolean_bytes(r, 22)
    enemies = struct.unpack('<484i', r.take(22*22*4))
    if any(not -1 <= n <= 10000 for n in enemies):
        raise ParseError('invalid minor enemy matrix')
    boolean_bytes(r, 22)
    # Seven-yield corpus: two 63-slot bullying arrays and a 22-slot last-ally
    # array, as documented in Lekmod source. Six-yield profile has none.
    r.take(extra_arrays)
    influence = list(struct.unpack('<22i', r.take(22*4)))
    if any(not -100000000 <= n <= 100000000 for n in influence):
        raise ParseError('invalid minor influence array')
    r.take(11*22*4)
    boolean_bytes(r, 4*22+2*80)
    for _ in range(22):
        for _ in range(r.count(128)):
            version, quest, start = r.unpack('I'), r.unpack('i'), r.unpack('i')
            r.take(8)
            if version not in (1, 2) or not 0 <= quest <= 30 or not -1 <= start <= turn:
                raise ParseError('invalid minor quest')
            if version == 2:
                boolean_bytes(r, 1)
    boolean_bytes(r, 1)  # notifications disabled
    end = r.pos
    if r.unpack('I') != 1:  # immediately following CvDealAI serialization version
        raise ParseError('missing following deal-AI boundary')
    return {'ally': None if ally == -1 else ally, 'allianceKnown': True,
            'allianceSinceTurn': None if ally == -1 else since,
            'allianceEvidence': {'offset': offset, 'endOffset': end,
                                 'playerIntervalEnd': limit}}


def add_alliances(world, state, yields):
    minors = [c for c in world['civilizations'] if c['kind'] == 'city-state']
    for civ in minors:
        civ.update(ally=None, allianceKnown=False)
    if not minors:
        world['extraction']['fields']['cityStateAlliances'] = 'extracted'
        return
    try:
        anchors = player_anchors(state, world['inspection']['plots']['endOffset'], yields, world['cities'])
    except ParseError as exc:
        world['extraction']['fields']['cityStateAlliances'] = 'unavailable'
        world['extraction']['warnings'].append(f'City-state alliances unknown: {exc}')
        return
    world['inspection']['playerIdentities'] = anchors
    majors = {c['id'] for c in world['civilizations'] if c['kind'] == 'major'}
    extra_arrays = 0 if yields == 6 else (2*63+22)*4
    for civ in minors:
        owner = civ['id']
        lo = anchors[owner]['endOffset']
        hi = anchors[owner+1]['offset'] if owner < 63 else len(state)
        # MinorCivAI precedes its player's cities. Validate all that record's
        # arrays/quests and the next AI boundary, not just the ally byte.
        hi = min([hi] + [c['evidence']['offset'] for c in world['cities'] if c['owner'] == owner])
        candidates, pos = [], lo
        while (pos := state.find(b'\x01\x00\x00\x00', pos, hi)) >= 0:
            try:
                value = read_minor_ai(state, pos, hi, world['game']['turn'], extra_arrays)
                if value['ally'] is not None and value['ally'] not in majors:
                    raise ParseError('ally missing from major civilization roster')
                candidates.append(value)
            except ParseError:
                pass
            pos += 1
        if len(candidates) == 1:
            civ.update(candidates[0])
        else:
            world['extraction']['warnings'].append(f"City-state {owner} alliance unknown: {len(candidates)} valid records.")
    known = sum(c['allianceKnown'] for c in minors)
    world['extraction']['fields']['cityStateAlliances'] = ('extracted' if known == len(minors) else 'partial' if known else 'unavailable')
