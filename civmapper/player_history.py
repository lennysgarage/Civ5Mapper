"""Turn-one player cohorts from a supplied matching save, never lobby names."""
import hashlib
import json
from pathlib import Path

from .extract import extract_bytes
from .render import validate_world
from .save import MAX_INPUT


def add_turn_one_players(world, reference):
    validate_world(world);validate_world(reference)
    if type(reference['game'].get('turn')) is not int or reference['game']['turn']!=1:
        raise ValueError('historical player evidence requires a turn-1 save; lobby/turn-0 snapshots are insufficient')
    if world['source']['kind']!='save' or reference['source']['kind']!='save':
        raise ValueError('turn-1 player evidence requires save-derived worlds')
    if any(world['game'][key]!=reference['game'][key] for key in ('width','height','wrapX','wrapY','coordinates')):
        raise ValueError('turn-1 save grid mismatch')
    def geography(w):
        return sorted((t['x'],t['y'],t['landWater'],t.get('elevation'),t.get('terrainId')) for t in w['tiles'])
    physical=geography(world)
    if physical!=geography(reference):raise ValueError('turn-1 save geography mismatch')
    def roster(w):
        return sorted((c['id'],c['key'],c.get('leaderKey')) for c in w['civilizations'] if c['kind']=='major')
    if roster(world)!=roster(reference):raise ValueError('turn-1 save civilization slot mismatch')
    # Script identity is an additional check when parser metadata is retained.
    def script(w):return w.get('inspection',{}).get('header',{}).get('mapScript')
    if script(world) and script(reference) and script(world)!=script(reference):
        raise ValueError('turn-1 save map script mismatch')
    by_id={c['id']:c for c in reference['civilizations']}
    statuses={}
    for civ in world['civilizations']:
        if civ['kind']!='major':continue
        value=by_id[civ['id']].get('setupSlotStatus')
        if value is not None and (type(value) is not int or not 0<=value<=4):
            raise ValueError('invalid turn-1 slot status')
        statuses[civ['id']]=value
    # Commit only after all joins/checks succeed, retaining current slot status.
    for civ in world['civilizations']:
        if civ['kind']=='major':civ['turnOneSlotStatus']=statuses[civ['id']]
    world['game']['turnOnePlayerEvidence']={
        'turn':1,'sourceSha256':reference['source'].get('sha256'),
        'geographySha256':hashlib.sha256(json.dumps(physical,separators=(',',':')).encode()).hexdigest(),
        'validation':'exact-grid-geography-major-roster',
    }
    world['extraction']['fields']['turnOnePlayerGroups']='extracted' if all(v in (1,3) for v in statuses.values()) else 'partial'
    return world


def load_turn_one_players(world, path):
    path=Path(path)
    if path.suffix.lower()!='.civ5save':raise ValueError('--turn-one-save must be a .Civ5Save')
    with path.open('rb') as handle:data=handle.read(MAX_INPUT+1)
    reference=extract_bytes(data,include_player_names=False)
    return add_turn_one_players(world,reference)
