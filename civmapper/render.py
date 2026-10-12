"""Deterministic SVG renderer for complete normalized JSON; no binary imports."""
import html
import math
import re
import textwrap
from collections import defaultdict
from .routes import route_segments
from .military import military_role, military_summary, detailed_symbol, ROLE_LABELS

DEFAULT_STYLE = {'oceanColor': '#315465', 'ownedWaterColor': '#699d9f', 'unownedColor': '#eee7d5',
                 'showUnownedPattern': True,
                 'borderColor': '#292a28', 'borderWidth': 1.4, 'showCities': True,
                 'showMountains': True, 'showCivilizationNames': True,
                 'showForests': True, 'countryFontSize': 18, 'cityFontSize': 10,
                 'colorOverrides': {}, 'empireLabels': 'player',
                 'shadeAlliedCityStates': True, 'allyShade': 0.35,
                 'showOwnedWater': True, 'mountainSize': 16,
                 'showCapitals': True, 'capitalSize': 12, 'showRoads': True,
                 'cityStateLabelColor': '#5b4775',
                 'showRivers': True, 'riverColor': '#397c9b', 'riverWidth': 2,
                 'roadColor': '#665548', 'roadWidth': 2, 'railroadColor': '#343e44',
                 'terrainColors': {}, 'unknownTerrainColor': '#b5b1a3', 'armyMarkerSize': 10,
                 'armyIcons': 'domain', 'showMilitarySummary': False}
TERRAIN_COLORS = {'TERRAIN_GRASS': '#92b979', 'TERRAIN_PLAINS': '#c7be80',
                  'TERRAIN_DESERT': '#e4c58c', 'TERRAIN_TUNDRA': '#a9ac99',
                  'TERRAIN_SNOW': '#f2f0e8', 'TERRAIN_COAST': '#699d9f',
                  'TERRAIN_OCEAN': '#315465', 'TERRAIN_MOUNTAIN': '#959992',
                  'TERRAIN_HILL': '#b8ac87'}
PALETTE = ('#d99572', '#9ab77a', '#c5a6c7', '#dec479', '#86b6ba', '#8d9fc3')
VERTICES = ((0, 2), (1, 1), (1, -1), (0, -2), (-1, -1), (-1, 1))


def validate_world(world):
    if world.get('schemaVersion') != '0.1':
        raise ValueError('unsupported schemaVersion')
    if world.get('extraction', {}).get('status') != 'complete':
        raise ValueError('render requires complete map data; partial inspection JSON cannot be rendered')
    game = world['game']
    width, height = game['width'], game['height']
    if any(type(n) is not int or not 1 <= n <= 1024 for n in (width, height)) or width * height > 500_000:
        raise ValueError('invalid grid dimensions')
    if game['coordinates'] != 'odd-r-bottom-up' or type(game['wrapX']) is not bool or type(game['wrapY']) is not bool:
        raise ValueError('invalid coordinate or wrapping declaration')
    if game['wrapY']:
        raise ValueError('vertical wrapping is not supported by the prototype renderer')
    if not isinstance(world['tiles'], list) or len(world['tiles']) != width * height:
        raise ValueError('complete maps require one tile at every coordinate')
    civs = world['civilizations']
    ids = [c['id'] for c in civs]
    if any(type(n) is not int or n < 0 for n in ids) or len(ids) != len(set(ids)):
        raise ValueError('invalid or duplicate civilization ID')
    by_id = {c['id']: c for c in civs}
    for civ in civs:
        if civ.get('playerName') is not None and not isinstance(civ['playerName'], str):
            raise ValueError('invalid player display name')
        if 'allianceKnown' in civ and type(civ['allianceKnown']) is not bool:
            raise ValueError('allianceKnown must be boolean')
        ally = civ.get('ally')
        if ally is not None and (type(ally) is not int or ally not in by_id or
                                 by_id[ally]['kind'] != 'major' or civ['kind'] != 'city-state'):
            raise ValueError('invalid city-state ally reference')
    by_pos = {}
    for tile in world['tiles']:
        x, y = tile['x'], tile['y']
        if type(x) is not int or type(y) is not int or not (0 <= x < width and 0 <= y < height):
            raise ValueError('tile outside grid')
        if (x, y) in by_pos:
            raise ValueError('duplicate tile coordinate')
        if tile['landWater'] not in ('land', 'water'):
            raise ValueError('renderer requires known land/water classification')
        if tile.get('ownershipKnown') is not True:
            raise ValueError('renderer requires known ownership, including explicit unowned tiles')
        if tile.get('riverEdges') is not None and (not isinstance(tile['riverEdges'],list) or
                any(e not in ('E','SE','SW') for e in tile['riverEdges']) or len(set(tile['riverEdges']))!=len(tile['riverEdges'])):
            raise ValueError('invalid river edges')
        owner = tile.get('owner')
        if owner is not None and (type(owner) is not int or owner not in ids):
            raise ValueError('tile references unknown owner')
        if 'routeKnown' in tile and type(tile['routeKnown']) is not bool:
            raise ValueError('routeKnown must be boolean')
        if tile.get('routeId') is not None and (type(tile['routeId']) is not int or tile['routeId'] < 0):
            raise ValueError('invalid route ID')
        if tile.get('route') is not None and not isinstance(tile['route'], str):
            raise ValueError('invalid route type')
        if 'routePillaged' in tile and type(tile['routePillaged']) is not bool:
            raise ValueError('routePillaged must be boolean')
        if tile.get('routeKnown') and (tile.get('routeId') is not None or tile.get('route') is not None) and tile['landWater'] != 'land':
            raise ValueError('physical routes must be on land')
        by_pos[x, y] = tile
    if not isinstance(world['cities'], list):
        raise ValueError('cities must be an array; null means unavailable')
    for city in world['cities']:
        x, y = city['x'], city['y']
        if type(x) is not int or type(y) is not int or (x, y) not in by_pos:
            raise ValueError('city outside grid')
        if city['owner'] not in ids or type(city['owner']) is not int:
            raise ValueError('city references unknown owner')
        if by_pos[x, y]['landWater'] != 'land' or by_pos[x, y]['owner'] != city['owner']:
            raise ValueError('city conflicts with tile geography or owner')
        if not isinstance(city['name'], str) or (city.get('capital') is not None and type(city['capital']) is not bool):
            raise ValueError('invalid city name or capital')
    capitals = [c for c in world['cities'] if c.get('capital') is True]
    if len({c['owner'] for c in capitals}) != len(capitals):
        raise ValueError('multiple current capitals for one owner')
    for civ in civs:
        if civ.get('capitalKnown') is True:
            matches = [c for c in capitals if c['owner'] == civ['id']]
            expected = civ.get('capitalCityId')
            if (expected is None and matches) or (expected is not None and (len(matches) != 1 or matches[0].get('id') != expected)):
                raise ValueError('capital city reference conflicts with city flags')
    return by_pos


def lattice(tile):
    x, y = 2 * tile['x'] + (tile['y'] & 1), 3 * tile['y']
    return [(x + dx, y + dy) for dx, dy in VERTICES]


def boundary_edges(world):
    """Exact shared-edge cancellation, including paired horizontal seam edges."""
    edges = defaultdict(list)
    width = world['game']['width']
    wrap = world['game']['wrapX']
    for tile in sorted(world['tiles'], key=lambda t: (t['y'], t['x'])):
        points = lattice(tile)
        for a, b in zip(points, points[1:] + points[:1]):
            key_points = ((a[0] % (2 * width), a[1]), (b[0] % (2 * width), b[1])) if wrap else (a, b)
            edges[tuple(sorted(key_points))].append((tile, a, b))
    result = []
    for entries in edges.values():
        first = entries[0][0]
        if len(entries) == 1:
            kind = 'coast' if first['landWater'] == 'land' else None
        else:
            other = entries[1][0]
            kind = ('coast' if first['landWater'] != other['landWater'] else
                    'border' if first['owner'] != other['owner'] else None)
        if kind:
            # A seam boundary appears at both visible cut edges; normal edges once.
            seen = set()
            for _, a, b in entries:
                geometry = tuple(sorted((a, b)))
                if geometry not in seen:
                    result.append((kind, a, b))
                    seen.add(geometry)
    return result


def polygon_rings(tiles):
    """Trace exact local edge unions; preserve islands and holes at the SVG cut."""
    edges = {}
    for tile in sorted(tiles, key=lambda t: (t['y'], t['x'])):
        points = lattice(tile)
        for a, b in zip(points, points[1:] + points[:1]):
            key = tuple(sorted((a, b)))
            if key in edges:
                del edges[key]
            else:
                edges[key] = (a, b)
    following = {}
    for a, b in edges.values():
        if a in following:
            raise ValueError('ambiguous polygon vertex')
        following[a] = b
    rings = []
    while following:
        start = min(following)
        current, ring = start, [start]
        while True:
            if current not in following:
                raise ValueError('open polygon boundary')
            current = following.pop(current)
            if current == start:
                break
            ring.append(current)
        rings.append(ring)
    return rings


def largest_component(tiles, width, wrap):
    remaining = {(t['x'], t['y']): t for t in tiles}
    components = []
    while remaining:
        start = min(remaining)
        pending, component = [start], []
        while pending:
            p = pending.pop()
            if p not in remaining:
                continue
            tile = remaining.pop(p)
            component.append(tile)
            x, y = p
            shift = y & 1
            for nx, ny in ((x-1,y),(x+1,y),(x-1+shift,y-1),(x+shift,y-1),(x-1+shift,y+1),(x+shift,y+1)):
                if wrap:
                    nx %= width
                if (nx,ny) in remaining:
                    pending.append((nx,ny))
        components.append(component)
    return max(components, key=len)


def empire_label(civ, mode='player'):
    """One label policy for map text and factual replay captions."""
    if mode == 'player' and civ.get('kind') == 'major' and civ.get('playerName'):
        return civ['playerName']
    return civ.get('name') or civ.get('key') or str(civ['id'])


def caption_footer(lines, width, top, config, turn):
    """Fixed-height SVG footer; full messages remain in accessible tooltips."""
    left = min(40, width / 10)
    available = width - 2 * left
    capacity = max(1, int(available / (16 * 0.65)))
    out = [f'<g class="replay-captions" transform="translate(0,{top:.2f})">',
           f'<title>{html.escape(chr(10).join(lines))}</title>',
           f'<rect width="{width:.2f}" height="120" fill="{config["unownedColor"]}"/>',
           f'<path d="M0,0 H{width:.2f}" stroke="{config["borderColor"]}" stroke-width="{config["borderWidth"]}"/>',
           f'<defs><clipPath id="caption-clip"><rect x="{left:.2f}" y="4" width="{available:.2f}" height="112"/></clipPath></defs>',
           f'<g clip-path="url(#caption-clip)" style="fill:{config["borderColor"]};stroke:none">']
    def row(text, y, css, bold=False):
        display = ' '.join(text.split())
        if len(display) > capacity:
            display = display[:max(0,capacity-1)] + '…'
        weight = ' font-weight="bold"' if bold else ''
        return (f'<text class="{css}" x="{left:.2f}" y="{y}" font-size="16"'
                f' style="fill:{config["borderColor"]};stroke:none"{weight}>'
                f'<title>{html.escape(text)}</title>{html.escape(display)}</text>')
    out.append(row(f'Turn {turn} — Major events', 24, 'caption-heading', True))
    for index, text in enumerate(lines[:3] or ['No major events recorded this turn.']):
        out.append(row(text, 46 + index * 20, 'caption-event' if lines else 'caption-empty'))
    if len(lines) > 3:
        out.append(row(f'+{len(lines)-3} more major events', 106, 'caption-overflow'))
    out.extend(['</g>', '</g>'])
    return out


def army_groups(world):
    """Known combat units only; ownership is independent of territorial owner."""
    units = world.get('units')
    if not isinstance(units, list) or world.get('extraction', {}).get('fields', {}).get('unitPositions') != 'extracted':
        raise ValueError('army mode requires extracted unit positions; extract with --units or use render-save --mode army')
    civs = {c['id']: c for c in world['civilizations']}
    seen, groups = set(), defaultdict(list)
    for unit in units:
        owner, x, y = unit['owner'], unit['x'], unit['y']
        if type(owner) is not int or owner not in civs or any(type(v) is not int for v in (x,y)) or not 0 <= x < world['game']['width'] or not 0 <= y < world['game']['height']:
            raise ValueError('invalid unit owner or coordinate')
        if not isinstance(unit['id'], str) or unit['id'] in seen:
            raise ValueError('invalid or duplicate unit identity')
        seen.add(unit['id'])
        if civs[owner]['kind'] != 'major':
            continue
        if unit.get('classificationKnown') is not True or type(unit.get('isMilitary')) is not bool:
            raise ValueError('army mode requires known military classification; supply the matching --ruleset when extracting the save')
        if not unit['isMilitary']:
            continue
        if not isinstance(unit.get('type'),str) or not isinstance(unit.get('domain'),str):
            raise ValueError('military units require resolved type and domain')
        groups[owner,x,y].append(unit)
    return dict(sorted(groups.items()))


def army_symbol(domain):
    """Domain symbols; unfamiliar/modded domains retain a generic shield."""
    if domain == 'DOMAIN_LAND':
        return 'land', '<path d="M-5,5 L4,-4 L5,-7 L2,-6 L-7,3 M-5,1 L-1,5 M5,5 L-4,-4 L-5,-7 L-2,-6 L7,3 M1,5 L5,1"/>'
    if domain == 'DOMAIN_SEA':
        return 'naval', '<path d="M-7,2 H7 L4,6 H-4 Z M0,2 V-7 M1,-6 L6,0 H1 Z M-1,-5 L-5,0 H-1 Z M-7,8 Q-4,6 -1,8 Q2,10 5,8"/>'
    if domain == 'DOMAIN_AIR':
        return 'air', '<path d="M0,-8 L2,-2 L7,2 V4 L2,2 L1,6 L3,8 H-3 L-1,6 L-2,2 L-7,4 V2 L-2,-2 Z"/>'
    return 'generic', '<path d="M-6,-6 H6 V1 Q5,5 0,8 Q-5,5 -6,1 Z M0,-3 V3 M-3,0 H3"/>'


def military_summary_panel(entries, civs, colors, label, width, start_y):
    """Append cards below the unchanged map; size them to their actual content."""
    columns = max(1, int((width-80)//340))
    card_width = (width-80-(columns-1)*16)/columns
    y = start_y+80
    cards = []
    for row_start in range(0,len(entries),columns):
        row = entries[row_start:row_start+columns]
        names = [textwrap.wrap(label(civs[e['owner']]),max(8,int((card_width-40)/8))) or ['Unnamed empire'] for e in row]
        row_height = max(64+len(name)*18+max(1,len(e['categories']))*20 for name,e in zip(names,row))
        for column,(entry,name_lines) in enumerate(zip(row,names)):
            owner=entry['owner']; x=40+column*(card_width+16)
            cards.append(f'<g class="military-summary-empire" data-owner="{owner}" data-total="{entry["total"]}"><rect x="{x:.2f}" y="{y:.2f}" width="{card_width:.2f}" height="{row_height:.2f}" rx="6" fill="#fff8e8" stroke="{colors[owner]}" stroke-width="2"/>')
            ty=y+25
            for line in name_lines:
                cards.append(f'<text x="{x+16:.2f}" y="{ty:.2f}" font-size="14" font-weight="bold">{html.escape(line)}</text>');ty+=18
            cards.append(f'<text class="military-total" x="{x+16:.2f}" y="{ty+4:.2f}" font-size="12">Military units: {entry["total"]}</text>');ty+=30
            if not entry['categories']:
                cards.append(f'<text x="{x+16:.2f}" y="{ty:.2f}" font-size="11">No military units on plots</text>')
            for role,count in entry['categories'].items():
                symbol=detailed_symbol(role) or army_symbol({'land':'DOMAIN_LAND','naval':'DOMAIN_SEA','air':'DOMAIN_AIR'}.get(role))[1]
                cards.append(f'<g class="military-summary-category" data-category="{role}" data-count="{count}"><g transform="translate({x+24:.2f} {ty-4:.2f}) scale(0.8)" fill="none" stroke="#242a30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{symbol}</g>'
                             f'<text x="{x+42:.2f}" y="{ty:.2f}" font-size="11">{html.escape(ROLE_LABELS[role])}</text><text x="{x+card_width-16:.2f}" y="{ty:.2f}" text-anchor="end" font-size="12" font-weight="bold">{count}</text></g>');ty+=20
            cards.append('</g>')
        y+=row_height+16
    height=y-start_y+8
    return height,[f'<g class="military-summary"><style>.military-summary text{{stroke:none;fill:#292a28}}</style><rect x="0" y="{start_y:.2f}" width="{width:.2f}" height="{height:.2f}" fill="#f4e9ce"/>'
                   f'<text x="40" y="{start_y+30:.2f}" font-size="18" font-weight="bold">Military summary</text>'
                   f'<text x="40" y="{start_y+50:.2f}" font-size="11">Major empires; current plot-referenced military units.</text>'
                   f'<text x="40" y="{start_y+66:.2f}" font-size="11">Civilians, city-states and barbarians excluded. Counts are not combat strength.</text>',*cards,'</g>']


def render_svg(world, style=None, *, caption_lines=None, mode='political', interactive=False):
    validate_world(world)
    if mode not in ('political','physical','army'):
        raise ValueError('mode must be political, physical or army')
    armies = army_groups(world) if mode == 'army' else {}
    if mode == 'physical' and any(not isinstance(t.get('terrain'),str) or not t['terrain'] for t in world['tiles']):
        raise ValueError('physical mode requires resolved terrain names; supply a matching --ruleset for save extraction or a matching --map for replay rendering')
    config = dict(DEFAULT_STYLE)
    if style:
        unknown = set(style) - set(config)
        if unknown:
            raise ValueError(f'unsupported style keys: {sorted(unknown)}')
        config.update(style)
    for key in ('oceanColor', 'ownedWaterColor', 'unownedColor', 'borderColor', 'roadColor', 'railroadColor', 'cityStateLabelColor', 'riverColor', 'unknownTerrainColor'):
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', config[key]):
            raise ValueError(f'invalid color: {key}')
    if type(config['borderWidth']) not in (int, float) or not 0 < config['borderWidth'] <= 10:
        raise ValueError('borderWidth must be between 0 and 10')
    for key in ('showCities', 'showMountains', 'showCivilizationNames', 'showForests', 'shadeAlliedCityStates', 'showOwnedWater', 'showRoads', 'showCapitals', 'showRivers', 'showUnownedPattern', 'showMilitarySummary'):
        if type(config[key]) is not bool:
            raise ValueError(f'{key} must be boolean')
    for key in ('countryFontSize', 'cityFontSize'):
        if type(config[key]) not in (int, float) or not 6 <= config[key] <= 48:
            raise ValueError(f'{key} must be between 6 and 48')
    if config['empireLabels'] not in ('player', 'civilization'):
        raise ValueError('empireLabels must be player or civilization')
    if type(config['allyShade']) not in (int, float) or not 0.05 <= config['allyShade'] <= 0.85:
        raise ValueError('allyShade must be between 0.05 and 0.85')
    if type(config['mountainSize']) not in (int, float) or not 6 <= config['mountainSize'] <= 30:
        raise ValueError('mountainSize must be between 6 and 30')
    if type(config['capitalSize']) not in (int, float) or not 6 <= config['capitalSize'] <= 16:
        raise ValueError('capitalSize must be between 6 and 16')
    if type(config['roadWidth']) not in (int, float) or not 0.5 <= config['roadWidth'] <= 5:
        raise ValueError('roadWidth must be between 0.5 and 5')
    if type(config['riverWidth']) not in (int,float) or not 0.5<=config['riverWidth']<=5:
        raise ValueError('riverWidth must be between 0.5 and 5')
    if not isinstance(config['colorOverrides'], dict):
        raise ValueError('colorOverrides must map civilization IDs to colors')
    for key, value in config['colorOverrides'].items():
        if not str(key).isdigit() or not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise ValueError('invalid color override')
    if not isinstance(config['terrainColors'],dict) or any(not isinstance(k,str) or not k.startswith('TERRAIN_') or not isinstance(v,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',v) for k,v in config['terrainColors'].items()):
        raise ValueError('terrainColors must map terrain type keys to hex colors')
    if type(config['armyMarkerSize']) not in (int,float) or not 6 <= config['armyMarkerSize'] <= 16:
        raise ValueError('armyMarkerSize must be between 6 and 16')
    if config['armyIcons'] not in ('domain','detailed'):
        raise ValueError('armyIcons must be domain or detailed')
    if mode!='army' and (config['showMilitarySummary'] or config['armyIcons']!='domain'):
        raise ValueError('detailed army icons and military summary require --mode army')
    radius, margin = 16, 40
    width, height = world['game']['width'], world['game']['height']
    def project(point):
        return ((point[0] + 1) * math.sqrt(3) * radius / 2 + margin,
                (3 * (height - 1) + 2 - point[1]) * radius / 2 + margin + 24)
    def center(tile):
        return project((2 * tile['x'] + (tile['y'] & 1), 3 * tile['y']))
    def coords(point):
        x, y = project(point)
        return f'{x:.2f},{y:.2f}'
    vw = (2 * width + 1) * math.sqrt(3) * radius / 2 + 2 * margin
    vh = (3 * height + 1) * radius / 2 + 2 * margin + 24
    if caption_lines is not None and (not isinstance(caption_lines, list) or
                                     any(not isinstance(line, str) for line in caption_lines)):
        raise ValueError('caption_lines must be a list of strings or None')
    canvas_height = vh + (120 if caption_lines is not None else 0)
    synthetic = world['source']['kind'] == 'synthetic'
    title = 'SYNTHETIC DEMO — NOT PARSED GAME DATA' if synthetic else f"{ {'political':'Political','physical':'Physical terrain','army':'Army'}[mode]} map · turn {world['game'].get('turn', '?')}"
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.2f} {canvas_height:.2f}">',
           f'<title>{html.escape(title)}</title>',
           f'<rect width="100%" height="100%" fill="{config["oceanColor"]}"/>',
           '<style>text{font-family:Georgia,serif;fill:#292a28;paint-order:stroke;stroke:#f4e9ce;stroke-width:0.6px;stroke-linejoin:round} .country{font-weight:bold;letter-spacing:1px}</style>',
           f'<text x="{margin}" y="30" font-size="13">{html.escape(title)}</text>']
    unowned_pattern=mode!='physical' and config['showUnownedPattern'] and any(t['landWater']=='land' and t['owner'] is None for t in world['tiles'])
    if unowned_pattern:
        out.append(f'<defs><pattern id="unowned-land" width="7" height="7" patternUnits="userSpaceOnUse">'
                   f'<rect width="7" height="7" fill="{config["unownedColor"]}"/>'
                   '<path d="M-1,1 L1,-1 M0,7 L7,0 M6,8 L8,6" stroke="#a99e84" stroke-width="0.6" opacity="0.45"/></pattern></defs>')
    civs = {c['id']: c for c in world['civilizations']}
    colors = {}
    for index, civ_id in enumerate(sorted(civs)):
        color = config['colorOverrides'].get(str(civ_id)) or civs[civ_id].get('color') or PALETTE[index % len(PALETTE)]
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            raise ValueError('invalid civilization color')
        colors[civ_id] = color  # Fallback palette is styling, never claimed as a game color.
    def label(civ):
        return empire_label(civ, config['empireLabels'])
    allies = {}
    if mode!='physical' and config['shadeAlliedCityStates']:
        for civ_id, civ in sorted(civs.items()):
            if civ.get('kind') == 'city-state' and civ.get('allianceKnown') is True and civ.get('ally') is not None:
                ally = civ['ally']
                allies[civ_id] = ally
                if str(civ_id) not in config['colorOverrides']:
                    rgb = [int(colors[ally][i:i+2], 16) for i in (1, 3, 5)]
                    colors[civ_id] = '#' + ''.join(f'{round(n+(255-n)*config["allyShade"]):02X}' for n in rgb)
    territories = defaultdict(list)
    water_territories = defaultdict(list)
    for tile in sorted(world['tiles'], key=lambda t: (t['y'], t['x'])):
        if tile['landWater'] == 'land':
            territories[tile['owner']].append(tile)
        elif tile['owner'] is not None and config['showOwnedWater']:
            water_territories[tile['owner']].append(tile)
    legend = []
    if unowned_pattern:legend.append('Hatched cream: unclaimed land.')
    if mode!='physical' and water_territories:
        legend.append('Tinted water: claimed territory. Borders retain ownership.')
    if allies:
        legend.append('Lighter land: allied city-states.')
    if config['showCities'] and config['showCapitals'] and any(c.get('capital') is True for c in world['cities']):
        legend.append('Gold stars: empire capitals. Purple diamonds: city-state capitals.')
    if config['showRoads'] and any(t.get('routeKnown') and t.get('routeId') is not None for t in world['tiles']):
        legend.append('Dashed red routes: pillaged.')
    if mode=='physical':
        legend.insert(0,'Terrain colors; hill, mountain and vegetation symbols. Territorial borders omitted.')
    if mode=='army':
        legend = ['Army: swords = land; ships = naval; planes = air; shields = other/mixed. Counts: stacks of 2+ units.'] + [entry for entry in legend if entry.startswith('Gold stars:')]
        if config['armyIcons']=='detailed':
            legend[0]='Army: ruleset military roles; shields = mixed roles. Counts: stacks of 2+ units. SVG tooltips list types.'
    if legend:
        out.append(f'<text x="{margin}" y="49" font-size="10">{html.escape(" ".join(legend))}</text>')
    if mode=='physical':
        terrain_groups=defaultdict(list)
        terrain_colors=dict(TERRAIN_COLORS, **config['terrainColors'])
        terrain_colors['TERRAIN_OCEAN']=config['terrainColors'].get('TERRAIN_OCEAN',config['oceanColor'])
        terrain_colors['TERRAIN_COAST']=config['terrainColors'].get('TERRAIN_COAST',config['ownedWaterColor'])
        for tile in world['tiles']:terrain_groups[tile['terrain']].append(tile)
        for terrain,tiles in sorted(terrain_groups.items()):
            path=' '.join('M '+' L '.join(coords(p) for p in ring)+' Z' for ring in polygon_rings(tiles))
            color=terrain_colors.get(terrain,config['unknownTerrainColor'])
            suffix=' (unmapped terrain color)' if terrain not in terrain_colors else ''
            out.append(f'<path data-terrain="{html.escape(terrain,quote=True)}" d="{path}" fill="{color}" fill-rule="evenodd"><title>{html.escape(terrain+suffix)}</title></path>')
    for owner, tiles in sorted(water_territories.items()) if mode!='physical' else []:
        path = ' '.join('M ' + ' L '.join(coords(p) for p in ring) + ' Z' for ring in polygon_rings(tiles))
        caption = f'Water owned by {label(civs[owner])}'
        out.append(f'<path data-owner="{owner}" data-surface="water" d="{path}" fill="{config["ownedWaterColor"]}" fill-rule="evenodd"><title>{html.escape(caption)}</title></path>')
    for owner, tiles in sorted(territories.items(), key=lambda p: -1 if p[0] is None else p[0]) if mode!='physical' else []:
        color = colors.get(owner, config['unownedColor'])
        if owner is None and unowned_pattern:color='url(#unowned-land)'
        path = ' '.join('M ' + ' L '.join(coords(p) for p in ring) + ' Z' for ring in polygon_rings(tiles))
        caption = 'Unowned land' if owner is None else label(civs[owner])
        relation = f' — allied with {label(civs[allies[owner]])}' if owner in allies else ''
        owner_label = owner if owner is not None else 'unowned'
        out.append(f'<path data-owner="{owner_label}" data-surface="land" d="{path}" fill="{color}" fill-rule="evenodd"><title>{html.escape(caption+relation)}</title></path>')
    if config['showRoads']:
        for segment in route_segments(world):
            kind = segment['kind']
            broken = segment['pillaged']
            color = '#9e4b40' if broken else config['railroadColor'] if kind == 'railroad' else config['roadColor']
            dash = ' stroke-dasharray="4 3"' if broken else ' stroke-dasharray="1.5 2"' if kind == 'railroad' else ''
            a, b = coords(segment['start']), coords(segment['end'])
            caption = ('Pillaged ' if broken else '') + kind.capitalize()
            out.append(f'<g class="route {kind}" data-pillaged="{str(broken).lower()}"><title>{caption}</title>'
                       f'<path d="M {a} L {b}" fill="none" stroke="#f4e8cd" stroke-width="{config["roadWidth"]+1:.2f}" stroke-linecap="round"{dash}/>'
                       f'<path d="M {a} L {b}" fill="none" stroke="{color}" stroke-width="{config["roadWidth"]:.2f}" stroke-linecap="round"{dash}/></g>')
    for kind, a, b in boundary_edges(world):
        if mode=='physical' and kind=='border':continue
        stroke_width = config['borderWidth'] * (1.3 if kind == 'coast' else 1)
        out.append(f'<path d="M {coords(a)} L {coords(b)}" fill="none" stroke="{config["borderColor"]}" stroke-width="{stroke_width:.2f}"/>')
    if config['showRivers']:
        for tile in sorted(world['tiles'],key=lambda t:(t['y'],t['x'])):
            points=lattice(tile)
            for edge in tile.get('riverEdges') or []:
                i={'E':1,'SE':2,'SW':3}[edge]
                a,b=points[i],points[i+1]
                pairs=[(a,b)]
                nx=tile['x']+({'E':1,'SE':tile['y']&1,'SW':(tile['y']&1)-1}[edge])
                ny=tile['y'] if edge=='E' else tile['y']-1
                if world['game']['wrapX'] and 0<=ny<height and not 0<=nx<width:
                    shift=2*width if nx<0 else -2*width
                    pairs.append(((a[0]+shift,a[1]),(b[0]+shift,b[1])))
                for a,b in pairs:
                    out.append(f'<path class="river" data-edge="{edge}" d="M {coords(a)} L {coords(b)}" fill="none" stroke="{config["riverColor"]}" stroke-width="{config["riverWidth"]:.2f}" stroke-linecap="round"/>')
    if mode=='physical':
        for tile in sorted(world['tiles'],key=lambda t:(t['y'],t['x'])):
            x,y=center(tile)
            if tile.get('elevation')=='hills':
                out.append(f'<path class="hill" data-x="{tile["x"]}" data-y="{tile["y"]}" d="M{x-6:.2f},{y+2:.2f} Q{x-3:.2f},{y-4:.2f} {x:.2f},{y+2:.2f} Q{x+3:.2f},{y-3:.2f} {x+6:.2f},{y+2:.2f}" fill="none" stroke="#695f48" stroke-width="1.2"><title>Hills</title></path>')
            feature=tile.get('feature')
            if feature=='FEATURE_ICE':
                path='M '+' L '.join(coords(p) for p in lattice(tile))+' Z'
                out.append(f'<path class="ice" d="{path}" fill="#edf5f2" stroke="#becfd0" stroke-width="0.6"><title>Ice</title></path>')
            elif feature in ('FEATURE_MARSH','FEATURE_OASIS','FEATURE_FLOOD_PLAINS'):
                symbol={'FEATURE_MARSH':'≈','FEATURE_OASIS':'○','FEATURE_FLOOD_PLAINS':'~'}[feature]
                out.append(f'<text class="terrain-feature" x="{x:.2f}" y="{y+4:.2f}" text-anchor="middle" font-size="14" style="fill:#397a6c"><title>{html.escape(feature)}</title>{symbol}</text>')
    if config['showMountains']:
        for tile in sorted(world['tiles'], key=lambda t: (t['y'], t['x'])):
            if tile.get('elevation') == 'mountain':
                x, y = center(tile)
                size = config['mountainSize']
                out.append(f'<g class="mountain" data-x="{tile["x"]}" data-y="{tile["y"]}"><title>Mountain</title>'
                           f'<path d="M{x-size/2:.2f},{y+size*0.35:.2f} L{x:.2f},{y-size*0.65:.2f} L{x+size/2:.2f},{y+size*0.35:.2f} Z" fill="#858e8e" stroke="#242f35" stroke-width="1.3" stroke-linejoin="round"/>'
                           f'<path d="M{x-size*0.17:.2f},{y-size*0.31:.2f} L{x:.2f},{y-size*0.65:.2f} L{x+size*0.17:.2f},{y-size*0.31:.2f} L{x:.2f},{y-size*0.39:.2f} Z" fill="#fff8e8"/></g>')
    if config['showForests']:
        for tile in sorted(world['tiles'], key=lambda t: (t['y'], t['x'])):
            if tile.get('feature') in ('FEATURE_FOREST', 'FEATURE_JUNGLE'):
                x,y = center(tile)
                out.append(f'<path d="M{x-3:.2f},{y+2:.2f} l3,-7 l3,7 Z M{x:.2f},{y+2:.2f} v3" fill="#36523c" opacity="0.65" stroke="#36523c" stroke-width="0.7"/>')
    occupied = [(margin, 15, vw-margin, 35)]
    if armies:
        at_position=defaultdict(list)
        for (owner,x,y),units in armies.items():at_position[x,y].append((owner,units))
        city_positions={(c['x'],c['y']) for c in world['cities']}
        size=config['armyMarkerSize']
        for (tx,ty),stacks in sorted(at_position.items(),key=lambda p:(p[0][1],p[0][0])):
            cx,cy=center({'x':tx,'y':ty})
            for index,(owner,units) in enumerate(stacks):
                x=cx+(index-(len(stacks)-1)/2)*(size*2+3)
                y=cy+(12 if (tx,ty) in city_positions and config['showCities'] else 0)
                domains={u['domain'] for u in units}
                domain=next(iter(domains)) if len(domains)==1 else 'mixed'
                caption=f'{label(civs[owner])}: {len(units)} military unit(s) at ({tx},{ty}) — '+', '.join(sorted(u.get('name') or u['type'] for u in units))
                icon,symbol=army_symbol(domain)
                if config['armyIcons']=='detailed':
                    roles={military_role(u) for u in units}
                    icon=next(iter(roles)) if len(roles)==1 else 'generic'
                    symbol=detailed_symbol(icon) or army_symbol(domain if len(roles)==1 else None)[1]
                out.append(f'<g class="army-marker" data-owner="{owner}" data-x="{tx}" data-y="{ty}" data-count="{len(units)}" data-domain="{html.escape(domain,quote=True)}" data-icon="{icon}"><title>{html.escape(caption)}</title>'
                           f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{size+1:.2f}" fill="#fff8e8" stroke="#242a30" stroke-width="1"/>'
                           f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{size-1:.2f}" fill="none" stroke="{colors[owner]}" stroke-width="2.5"/>'
                           f'<g class="army-symbol" transform="translate({x:.2f} {y:.2f}) scale({size/10:.3f})" fill="none" stroke="#242a30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{symbol}</g>')
                if len(units)>1:
                    bx,by=x+size*0.8,y+size*0.8
                    count_font=min(size*0.8,size*1.2/len(str(len(units))))
                    out.append(f'<g class="army-stack-count"><circle cx="{bx:.2f}" cy="{by:.2f}" r="{size*0.55:.2f}" fill="#fff8e8" stroke="#242a30" stroke-width="0.8"/>'
                               f'<text x="{bx:.2f}" y="{by+count_font*0.35:.2f}" text-anchor="middle" font-size="{count_font:.2f}" font-weight="bold" style="fill:#242a30;stroke:none">{len(units)}</text></g>')
                out.append('</g>')
                extent=size*1.4+3
                occupied.append((x-extent,y-extent,x+extent,y+extent))
    if config['showCities']:
        for city in world['cities']:
            x, y = center(city)
            size = config['capitalSize'] if city.get('capital') is True and config['showCapitals'] else 3.2
            occupied.append((x-size-2,y-size-2,x+size+2,y+size+2))
    def intersects(box):
        return any(box[0] < other[2] and box[2] > other[0] and box[1] < other[3] and box[3] > other[1] for other in occupied)
    if mode!='physical' and config['showCivilizationNames']:
        for civ_id, tiles in sorted(territories.items(), key=lambda p: -1 if p[0] is None else p[0]):
            if civ_id is None or civs[civ_id].get('kind') == 'city-state':
                continue
            tiles = largest_component(tiles, width, world['game']['wrapX'])
            positions = [center(t) for t in tiles]
            mx, my = (sum(p[i] for p in positions) / len(positions) for i in (0, 1))
            country_label = label(civs[civ_id])
            font = config['countryFontSize'] if civs[civ_id].get('kind') != 'city-state' else config['cityFontSize']+1
            length = len(country_label)*font*0.58
            for x, y in sorted(positions, key=lambda p: ((p[0]-mx)**2+(p[1]-my)**2,p[1],p[0])):
                box = (x-length/2, y-10-font, x+length/2, y-8)
                if box[0] >= 0 and box[2] <= vw and not intersects(box):
                    occupied.append(box)
                    owner_attr=f' data-owner="{civ_id}"' if interactive else ''
                    out.append(f'<text class="country"{owner_attr} x="{x:.2f}" y="{y-10:.2f}" text-anchor="middle" font-size="{font}">{html.escape(country_label)}</text>')
                    break
    if config['showCities']:
        for city in sorted(world['cities'], key=lambda c: (-int(c.get('capital') is True), -c.get('population',0), c['y'], c['x'], c['name'])):
            x, y = center(city)
            capital = city.get('capital') is True and config['showCapitals']
            city_attrs=(f' data-city-id="{html.escape(str(city["id"]),quote=True)}" data-owner="{city["owner"]}"'
                        f' data-x="{city["x"]}" data-y="{city["y"]}"') if interactive else ''
            marker_size = config['capitalSize'] if capital else 3.2
            if capital:
                minor=civs[city['owner']].get('kind')=='city-state'
                points = []
                for i in range(10):
                    angle = -math.pi/2+i*math.pi/5
                    point_radius = marker_size*(0.78 if i%2==0 else 0.34)
                    points.append(f'{x+point_radius*math.cos(angle):.2f},{y+point_radius*math.sin(angle):.2f}')
                if minor:
                    badge=f'<polygon class="city-state-capital" points="{x:.2f},{y-marker_size:.2f} {x+marker_size:.2f},{y:.2f} {x:.2f},{y+marker_size:.2f} {x-marker_size:.2f},{y:.2f}" fill="#71558f" stroke="#f4e9ce" stroke-width="1.3"/>'
                else:
                    badge=f'<circle class="empire-capital" cx="{x:.2f}" cy="{y:.2f}" r="{marker_size}" fill="#fff8e8" stroke="#3c3025" stroke-width="1.3"/>'
                star_fill='#f1e7fa' if minor else '#c99734'
                capital_position='' if interactive else f' data-x="{city["x"]}" data-y="{city["y"]}"'
                out.append(f'<g class="capital-marker"{city_attrs} data-kind="{"city-state" if minor else "empire"}"{capital_position}><title>{html.escape(city["name"])} — current {"city-state " if minor else ""}capital</title>'
                           +badge+f'<polygon points="{" ".join(points)}" fill="{star_fill}" stroke="{"#49365d" if minor else "#3c3025"}" stroke-width="0.9"/></g>')
            else:
                out.append(f'<circle class="city-marker"{city_attrs} cx="{x:.2f}" cy="{y:.2f}" r="3.2" fill="#292a28" stroke="#f4e9ce" stroke-width="1.1"><title>{html.escape(city["name"])}</title></circle>')
            font = config['cityFontSize']
            length = len(city['name'])*font*0.58
            gap = marker_size+4 if capital else 9
            for dx,dy in ((gap,4),(-length-gap,4),(gap,-8),(-length-gap,-8),(gap,17),(-length-gap,17)):
                box = (x+dx-2, y+dy-font-2, x+dx+length+2, y+dy+3)
                if box[0] >= 0 and box[2] <= vw and box[1] >= 0 and box[3] <= vh and not intersects(box):
                    occupied.append(box)
                    weight = ' font-weight="bold"' if capital else ''
                    minor_style = f' style="fill:{config["cityStateLabelColor"]}" class="city-state-label"' if civs[city['owner']].get('kind') == 'city-state' else ' class="city-label"'
                    out.append(f'<text{city_attrs} x="{x+dx:.2f}" y="{y+dy:.2f}" font-size="{font}"{weight}{minor_style}>{html.escape(city["name"])}</text>')
                    break
    if caption_lines is not None:
        out.extend(caption_footer(caption_lines, vw, vh, config, world['game'].get('turn', '?')))
    if config['showMilitarySummary']:
        panel_width=max(vw,480)
        panel_height,panel=military_summary_panel(military_summary(world['civilizations'],armies),civs,colors,label,panel_width,canvas_height)
        canvas_height+=panel_height
        out[0]=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {panel_width:.2f} {canvas_height:.2f}">'
        out.extend(panel)
    out.append('</svg>')
    return '\n'.join(out) + '\n'
