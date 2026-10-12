"""Current capital references from validated, empirical player-prefix profiles.

These offsets belong to the tested layouts, not arbitrary DLL compatibility.
A current owner/local city ID must join a decoded city. Historical flags,
original capital coordinates and founding order never choose the capital.
"""
import struct
from .diplomacy import player_anchors, boolean_bytes
from .save import Reader, ParseError

PLAYER_PROFILES = {
    'bnw-six-yield': {'prefixBytes': 908, 'capitalBack': 257, 'tailInts': 64,
                      'originalXIndex': 39, 'trailerBooleans': 1, 'yields': 6},
    'observed-seven-yield': {'prefixBytes': 1050, 'capitalBack': 262, 'tailInts': 65,
                             'originalXIndex': 40, 'trailerBooleans': 2, 'yields': 7},
}


def read_capital(state, anchor, profile, world):
    identity = anchor['offset']
    start = identity - profile['prefixBytes']
    if start < world['inspection']['plots']['endOffset']:
        raise ParseError('player prefix overlaps plots')
    r = Reader(state, start)
    if r.unpack('I') != 16:
        raise ParseError('unsupported capital player version')
    sx, sy, population, land, scored = [r.unpack('i') for _ in range(5)]
    width, height = world['game']['width'], world['game']['height']
    starting_valid = (-1 <= sx < width and -1 <= sy < height) or (sx, sy) == (-2147483647, -2147483647)
    if not (starting_valid and 0 <= scored <= width*height):
        raise ParseError('invalid player-prefix coordinates/count')
    cities = [c for c in world['cities'] if c['owner'] == anchor['id']]
    if population != sum(c['population'] for c in cities):
        raise ParseError('player population does not match current cities')
    if land != sum(t['owner'] == anchor['id'] and t['landWater'] == 'land' for t in world['tiles']):
        raise ParseError('player land does not match current plots')
    offset = identity - profile['capitalBack']
    r = Reader(state, offset)
    tail = list(struct.unpack('<' + str(profile['tailInts']) + 'i', r.take(profile['tailInts']*4)))
    boolean_bytes(r, profile['trailerBooleans'])
    if r.pos != identity:
        raise ParseError('capital tail does not meet player identity boundary')
    # Check named neighboring fields to corroborate the tail alignment. Original
    # coordinates are checked for range only; they do not select a current city.
    ox, oy = tail[profile['originalXIndex']:profile['originalXIndex']+2]
    if not -1 <= ox < width or not -1 <= oy < height or not -1 <= tail[4] <= world['game']['turn']:
        raise ParseError('invalid capital-tail coordinates/turn')
    alive = state[identity+1]
    local_id = tail[0]
    if local_id < -1:
        raise ParseError('invalid current capital local ID')
    matches = [c for c in cities if c['localId'] == local_id]
    if cities and (alive != 1 or len(matches) != 1):
        raise ParseError('capital reference does not uniquely match a current owned city')
    if not cities and alive == 1 and local_id != -1:
        raise ParseError('living player has an unresolved capital reference')
    # Dead players can retain a stale capital ID. Without current owned cities
    # it never marks a conqueror's city or a same-numbered city in another slot.
    current = matches[0] if matches else None
    return {'capitalKnown': True, 'capitalCityId': current['id'] if current else None,
            'capitalEvidence': {'playerPrefixOffset': start, 'referenceOffset': offset,
                                'identityOffset': identity, 'storedLocalId': local_id,
                                'playerAlive': bool(alive)}}


def add_capitals(world, state, profile_name):
    profile = PLAYER_PROFILES[profile_name]
    for civ in world['civilizations']:
        civ.update(capitalKnown=False, capitalCityId=None)
    try:
        anchors = world['inspection'].get('playerIdentities')
        if anchors is None:
            anchors = player_anchors(state, world['inspection']['plots']['endOffset'], profile['yields'], world['cities'])
            world['inspection']['playerIdentities'] = anchors
    except ParseError as exc:
        world['extraction']['fields']['capitals'] = 'unavailable'
        world['extraction']['warnings'].append(f'Current capitals unknown: {exc}')
        return
    known = 0
    for civ in world['civilizations']:
        try:
            info = read_capital(state, anchors[civ['id']], profile, world)
        except ParseError as exc:
            world['extraction']['warnings'].append(f"Player {civ['id']} capital unknown: {exc}")
            continue
        civ.update(info)
        known += 1
        for city in world['cities']:
            if city['owner'] == civ['id']:
                city['capital'] = city['id'] == info['capitalCityId']
    world['extraction']['fields']['capitals'] = ('extracted' if known == len(world['civilizations']) else 'partial' if known else 'unavailable')
