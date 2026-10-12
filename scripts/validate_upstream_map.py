"""Compare normalized geography/politics to a local upstream JSON fixture."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from civmapper.mapio import upstream_map
from civmapper.render import render_svg
p=argparse.ArgumentParser();p.add_argument('fixture',type=Path);p.add_argument('-o','--output',type=Path,required=True)
a=p.parse_args();doc=json.loads(a.fixture.read_text());world=upstream_map(doc);m=doc['MapData'];tiles=world['tiles']
for t in tiles:
    raw=m['MapTiles'][t['y']][t['x']];imp=m['MapTileImprovements'][t['y']][t['x']]
    assert t['terrainId']==raw['TerrainType']
    assert t['elevation']==('flat','hills','mountain')[raw['Elevation']]
    assert t['landWater']==('water' if m['TerrainList'][raw['TerrainType']] in ('TERRAIN_OCEAN','TERRAIN_COAST') else 'land')
    assert t['owner']==(None if imp['Owner'] in (-1,255,65535,4294967295) else imp['Owner'])
    assert bool(any(c['x']==t['x'] and c['y']==t['y'] for c in world['cities']))==(imp['CityId']!=-1)
report={'fixture':a.fixture.name,'tiles':len(tiles),'cities':len(world['cities']),'civilizations':len(world['civilizations']),
        'geographyAndPolitics':'passed','pixelParity':'not claimed; atlas SVG style differs from upstream raster'}
a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
