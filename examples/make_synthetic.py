"""Generate an explicitly fictional renderer fixture; no save input."""
import json
from pathlib import Path

world = {
    'schemaVersion': '0.1', 'source': {'kind': 'synthetic'},
    'extraction': {'status': 'complete', 'fields': {}, 'warnings': ['Fictional renderer fixture.']},
    'game': {'turn': 0, 'width': 16, 'height': 10, 'wrapX': True, 'wrapY': False,
             'coordinates': 'odd-r-bottom-up'},
    'civilizations': [
        {'id': 0, 'name': 'Amber League', 'key': 'SYNTHETIC_AMBER', 'kind': 'major', 'color': '#d99572'},
        {'id': 1, 'name': 'Verdant Union', 'key': 'SYNTHETIC_VERDANT', 'kind': 'major', 'color': '#9ab77a'},
        {'id': 2, 'name': 'Isles', 'key': 'SYNTHETIC_ISLES', 'kind': 'city-state', 'color': '#c5a6c7'},
    ], 'tiles': [], 'cities': [
        {'id': '0:1', 'name': 'Amberport', 'x': 4, 'y': 4, 'owner': 0, 'capital': True},
        {'id': '1:1', 'name': 'Greenhaven', 'x': 10, 'y': 5, 'owner': 1, 'capital': True},
        {'id': '2:1', 'name': 'Islewatch', 'x': 13, 'y': 2, 'owner': 2, 'capital': False},
    ],
}
for y in range(10):
    for x in range(16):
        main = ((x-7.0)/6)**2 + ((y-5.0)/3.5)**2 < 1 and (x, y) not in ((6, 3), (6, 4))
        island = (x, y) in ((13, 2), (14, 2), (13, 1))
        land = main or island
        owner = (2 if island else 0 if x < 7 else 1) if land else None
        world['tiles'].append({'x': x, 'y': y, 'landWater': 'land' if land else 'water',
                               'terrain': 'TERRAIN_GRASS' if land else 'TERRAIN_OCEAN',
                               'elevation': 'mountain' if main and x == 7 and y in (4, 5, 6) else 'flat',
                               'feature': None, 'owner': owner, 'ownershipKnown': True,
                               'riverEdges': [], 'isLake': None, 'visibility': None})
Path(__file__).with_name('synthetic-world.json').write_text(json.dumps(world, indent=2) + '\n', encoding='utf-8')
