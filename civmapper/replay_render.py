"""Replay event state machine and SVG/Pillow export; no binary decoding here."""
import copy
import io
import math
import re
from pathlib import Path
from .mapio import base_world
from .replay import dimensions, map_stem, validate_events, MAX_EVENTS, MAX_TURN
from .render import render_svg, validate_world, empire_label, DEFAULT_STYLE


def validate_replay(replay):
    if replay.get('schemaVersion')!='0.1' or replay.get('kind')!='replay':
        raise ValueError('requires CivMapper replay JSON version 0.1')
    if replay.get('extraction',{}).get('status')!='complete':raise ValueError('replay extraction is incomplete')
    game=replay['game']
    if type(game['startTurn']) is not int or type(game['endTurn']) is not int or not 0<=game['startTurn']<=game['endTurn']<=MAX_TURN:
        raise ValueError('invalid replay turn range')
    ids=[c['id'] for c in replay['civilizations']]
    if any(type(i) is not int or i<0 for i in ids) or len(set(ids))!=len(ids) or len(ids)>128:
        raise ValueError('invalid replay civilization roster')
    if not isinstance(replay['events'],list) or len(replay['events'])>MAX_EVENTS:raise ValueError('invalid replay event array')
    validate_events(replay['events'],replay['civilizations'],game.get('width'),game.get('height'),game['startTurn'],game['endTurn'])


def prepare(replay, base=None, map_filename=None, wrap_x=None, owner_map=None):
    validate_replay(replay)
    if not replay['events']:raise ValueError('replay has no events to animate')
    warnings=list(replay['extraction']['warnings'])
    game=replay['game']
    if base is not None:
        validate_world(base)
        world=copy.deepcopy(base)
        if game.get('width') is not None and (game['width'],game['height'])!=(world['game']['width'],world['game']['height']):
            raise ValueError('base map/replay grid dimensions mismatch')
        if replay.get('tiles') is not None:
            physical={(t['x'],t['y']):t for t in replay['tiles']}
            if len(physical)!=len(world['tiles']):raise ValueError('replay physical coordinate coverage mismatch')
            river_mismatches=0
            for t in world['tiles']:
                p=physical.get((t['x'],t['y']))
                if p is None:raise ValueError('replay physical coordinate coverage mismatch')
                plot=3 if t['landWater']=='water' else {'mountain':0,'hills':1,'flat':2}.get(t.get('elevation'))
                expected=p.get('plotType',3 if p.get('landWater')=='water' else {'mountain':0,'hills':1,'flat':2}.get(p.get('elevation')))
                if plot!=expected or (t.get('terrainId') is not None and p.get('terrainId') is not None and t['terrainId']!=p['terrainId']):
                    raise ValueError(f"base map/replay tile geography mismatch at ({t['x']},{t['y']})")
                if t.get('riverEdges') is not None and p.get('riverEdges') is not None and set(t['riverEdges'])!=set(p['riverEdges']):
                    river_mismatches+=1
            if river_mismatches:warnings.append(f'River snapshots differ on {river_mismatches} plots; base-map edges used (upstream warning policy).')
        else:warnings.append('Replay lacks geography; only event coordinates can be checked against the base map.')
        if map_filename and game.get('mapFilename') and map_stem(map_filename)!=map_stem(game['mapFilename']):
            warnings.append('Base map filename differs from the recorded map filename; geographic checks still apply.')
    else:
        if replay.get('tiles') is None:raise ValueError('replay lacks geography; provide --map')
        width,height=game['width'],game['height'];dimensions(width,height)
        wrap=game.get('wrapX') if wrap_x is None else wrap_x
        if type(wrap) is not bool:
            raise ValueError('replay files do not record wrapping: provide --map, --wrap-x or --no-wrap-x')
        tiles=[]
        for p in replay['tiles']:
            t=copy.deepcopy(p)
            if 'plotType' in t:
                t.update(landWater='water' if t['plotType']==3 else 'land',
                         elevation={0:'mountain',1:'hills',2:'flat',3:'flat'}[t['plotType']],terrain=None)
                t.pop('featureId',None) # mod-dependent ID, no unverified feature names
            t.update(owner=None,ownershipKnown=True)
            tiles.append(t)
        world=base_world(width,height,wrap,tiles,copy.deepcopy(replay['source']))
    if wrap_x is not None and base is not None and wrap_x!=base['game']['wrapX']:
        raise ValueError('explicit wrapping conflicts with base map')
    civs=copy.deepcopy(replay['civilizations'])
    # Carry only exact metadata matches; never reorder the replay IDs into
    # scenario-owner IDs or guess English-name-to-civilization conversions.
    for c in civs:
        candidates=[b for b in world['civilizations'] if
                    (c.get('minorKey') and b.get('minorKey')==c['minorKey']) or
                    (not c.get('minorKey') and c.get('key') and b.get('key')==c['key'])]
        if len(candidates)==1:
            for key in ('color','colorKey','kind'):
                if candidates[0].get(key) is not None:c[key]=candidates[0][key]
            if not c.get('name') and candidates[0].get('name'):c['name']=candidates[0]['name']
        for key in ('ally','allianceKnown','allianceSinceTurn','capitalKnown','capitalCityId','capitalEvidence'):
            c.pop(key,None)
        c.setdefault('kind','unknown');c.setdefault('color',None)
    initial_cities=[]
    seed_scenario=base is not None and base['source'].get('kind')=='map'
    if seed_scenario:
        mapping={int(k):v for k,v in (owner_map or {}).items()}
        replay_ids={c['id'] for c in civs}
        for b in base['civilizations']:
            if b['id'] not in mapping:
                matches=[c for c in civs if b.get('key') and b['key'] in (c.get('key'),c.get('minorKey'))]
                if len(matches)==1:mapping[b['id']]=matches[0]['id']
        required={t['owner'] for t in world['tiles'] if t['owner'] is not None}
        if any(o not in mapping or mapping[o] not in replay_ids for o in required):
            raise ValueError('scenario owners cannot be joined to replay IDs; provide --owner-map JSON with explicit scenario-owner to replay-ID mapping')
        for t in world['tiles']:
            if t['owner'] is not None:t['owner']=mapping[t['owner']]
        for city in world['cities']:
            city['owner']=mapping[city['owner']];city['capital']=None
        initial_cities=world['cities']
    world['civilizations']=civs
    world['source']=copy.deepcopy(replay['source'])
    world['extraction']['warnings']=warnings
    world['extraction']['fields'].update(historicalCapitals='unavailable',historicalRoads='unavailable',historicalAlliances='unavailable')
    warnings.append('Scenario map initial politics seed the replay using verified or explicit owner IDs.' if seed_scenario else
                    'Political state starts unclaimed; final-save politics are not seeded into history.')
    for t in world['tiles']:
        if not seed_scenario:t['owner']=None
        t.update(ownershipKnown=True,routeKnown=False,routeId=None,route=None)
        t.pop('cityReference',None)
    world['cities']=initial_cities
    world.pop('units',None) # Present-day forces never become historical positions.
    validate_events(replay['events'],civs,world['game']['width'],world['game']['height'],game['startTurn'],game['endTurn'])
    validate_world(world)
    return world,warnings


def replay_frames(replay, base=None, maxturns=0, map_filename=None, wrap_x=None, owner_map=None):
    """One frame per eventful turn; maxturns is a count, matching upstream."""
    for world, notes in replay_steps(replay, base, maxturns, map_filename, wrap_x, owner_map):
        yield world


def replay_steps(replay, base=None, maxturns=0, map_filename=None, wrap_x=None, owner_map=None):
    """Apply events once and emit each world with evidence for major captions."""
    if type(maxturns) is not int or maxturns<0:raise ValueError('maxturns must be nonnegative')
    world,warnings=prepare(replay,base,map_filename,wrap_x,owner_map)
    grouped={}
    for event in replay['events']:
        grouped.setdefault(event['turn'],[]).append(event)
    turns=sorted(grouped)
    if maxturns:turns=turns[:maxturns]
    plots={(t['x'],t['y']):t for t in world['tiles']}
    cities={(c['x'],c['y']):c for c in world['cities']};next_id=0
    for turn in turns:
        notes=[]
        for event in grouped[turn]:
            event_notes=[]
            kind,owner=event['typeId'],None if event['civId']==-1 else event['civId']
            for p in event['tiles']:
                pos=(p['x'],p['y'])
                if kind not in (1,2,3,4):continue
                tile=plots[pos]
                if kind==1:
                    if tile['landWater']!='land':raise ValueError('replay founds a city on water')
                    name=event['text'].removesuffix(' is founded.')
                    cities[pos]={'id':f'replay:{next_id}','name':name,'x':pos[0],'y':pos[1],
                                 'owner':tile['owner'],'capital':None,'nameSource':'replay-event-text'}
                    next_id+=1
                    event_notes.append({'kind':'founded','name':name,'x':pos[0],'y':pos[1]})
                elif kind in (2,3):
                    tile['owner']=owner
                    if pos in cities:
                        previous=cities[pos]['owner']
                        if previous is not None and previous!=owner:
                            event_notes.append({'kind':'ownership','name':cities[pos]['name'],
                                                'x':pos[0],'y':pos[1],'previous':previous,'owner':owner})
                        cities[pos]['owner']=owner
                else:
                    if pos in cities:
                        event_notes.append({'kind':'removed','name':cities[pos]['name'],
                                            'x':pos[0],'y':pos[1]})
                    tile['owner']=None;cities.pop(pos,None)
                    # Upstream marks razed tiles as roads. The event records no
                    # road state, so physical route status stays unknown here.
            if event_notes:
                if event['text'].strip():
                    notes.append({'text':event['text']}) # one written message per event, not per tile
                else:
                    notes.extend(event_notes)
        world['game']['turn']=turn
        if any(c['owner'] is None for c in cities.values()):
            raise ValueError(f'turn {turn} has a city without logged ownership; no ownership is guessed')
        world['cities']=sorted(cities.values(),key=lambda c:(c['y'],c['x'],c['id']))
        validate_world(world)
        yield copy.deepcopy(world),notes


def caption_text(notes, world, style=None):
    """Use literal messages or descriptions of observed city state transitions."""
    civs={c['id']:c for c in world['civilizations']}
    mode=(style or {}).get('empireLabels',DEFAULT_STYLE['empireLabels'])
    def owner_name(owner):
        return 'unclaimed' if owner is None else empire_label(civs[owner],mode)
    lines=[]
    for note in notes:
        if 'text' in note:
            lines.append(note['text'])
            continue
        name=note['name'] or f"({note['x']},{note['y']})"
        if note['kind']=='founded':
            lines.append(f'City founded: {name}.')
        elif note['kind']=='ownership':
            lines.append(f"Ownership changed: {name} — {owner_name(note['previous'])} → {owner_name(note['owner'])}.")
        else:
            lines.append(f'City removed: {name}.')
    return lines


def render_replay(replay, output, base=None, style=None, maxturns=0, map_filename=None,
                  wrap_x=None, duration=1000, scale=0.5, owner_map=None, *, captions=False,mode='political'):
    output=Path(output)
    if mode=='army':raise ValueError('historical unit positions are unavailable; army mode supports current saves/world JSON only')
    if mode not in ('political','physical'):raise ValueError('unsupported replay mode')
    if type(duration) is not int or not 10<=duration<=60_000:raise ValueError('duration must be 10–60000 ms')
    if type(captions) is not bool:raise ValueError('captions must be boolean')
    if not 0.25<=scale<=2:raise ValueError('replay scale must be 0.25–2')
    if output.suffix.lower() not in ('.gif','.svg'):raise ValueError('replay output must be .gif or .svg')
    if output.suffix.lower()=='.gif':
        try:
            from PIL import Image
            import cairosvg
        except ImportError:
            raise ValueError('GIF export requires optional dependencies: pip install ".[gif]"') from None
    frames=[];metadata=[];pixels=0
    for world,notes in replay_steps(replay,base,maxturns,map_filename,wrap_x,owner_map):
        lines=caption_text(notes,world,style) if captions else None
        svg=render_svg(world,style,caption_lines=lines,mode=mode)
        if output.suffix.lower()=='.svg':
            # Use maxturns 1 for first frame; otherwise export the last turn.
            last_svg=svg
        else:
            view=re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"',svg)
            frame_pixels=math.ceil(float(view[1])*scale)*math.ceil(float(view[2])*scale)
            if frame_pixels>20_000_000 or pixels+frame_pixels>150_000_000:
                raise ValueError('GIF frame memory budget exceeded; lower --scale or --maxturns')
            image=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(),scale=scale))).convert('RGB')
            pixels+=image.width*image.height
            if pixels>150_000_000:raise ValueError('GIF frame memory budget exceeded; lower --scale or --maxturns')
            frames.append(image)
        metadata.append({'turn':world['game']['turn'],'cities':len(world['cities']),
                         'ownedTiles':sum(t['owner'] is not None for t in world['tiles'])})
        if captions:metadata[-1]['captions']=lines
    if not metadata:raise ValueError('replay has no frames')
    if frames:
        # One palette sampled across ALL turns includes civilizations that have
        # not founded cities in the first frame. A first-frame-only palette
        # would map their later colors to unrelated initial colors.
        samples=Image.new('RGB',(64,64*len(frames)))
        for i,frame in enumerate(frames):samples.paste(frame.resize((64,64)),(0,64*i))
        palette=samples.quantize(colors=256,dither=Image.Dither.NONE)
        frames=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
        frames[0].save(output,format='GIF',save_all=True,append_images=frames[1:],duration=duration,
                       loop=0,optimize=False,disposal=2)
    else:output.write_text(last_svg,encoding='utf-8')
    return {'frames':metadata,'warnings':world['extraction']['warnings']}
