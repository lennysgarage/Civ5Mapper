"""Civ5Map v11/12 and upstream JSON adapter (MIT layout adaptation; NOTICE).

Map owner encoding (major 0..31, minor 32..95) is distinct from save slots
and replay indexes. Free allocator slots never become active cities/units.
"""
import hashlib
import json
import struct
from pathlib import Path
from .save import MAX_INPUT, ParseError, Reader
from .replay import dimensions
from .render import validate_world


def cstring(data):
    try:
        return data.split(b'\0',1)[0].decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ParseError('invalid map UTF-8') from exc


def string_table(data):
    if not data:
        return []
    if data[-1] != 0:
        raise ParseError('unterminated map string table')
    return [cstring(s) for s in data[:-1].split(b'\0')]


def allocator(data, size, link_size=4):
    if not data:
        return [], set()
    if len(data)<4 or (len(data)-4)%size:
        raise ParseError('misaligned map free-list array')
    head=struct.unpack_from('<i',data)[0]
    records=[data[i:i+size] for i in range(4,len(data),size)]
    free=set()
    while head != -1:
        if head<0 or head>=len(records) or head in free:
            raise ParseError('invalid or cyclic map free-list')
        free.add(head)
        head=struct.unpack_from('<h' if link_size==2 else '<i',records[head])[0]
    return records,free


def geography(tiles, terrain_names, features, wonders=None):
    output=[]
    for t in tiles:
        index=t['terrainId']
        if not 0<=index<len(terrain_names):
            raise ParseError('invalid map terrain index')
        terrain=terrain_names[index]
        elevation=t['mapElevation']
        if elevation not in (0,1,2):
            raise ParseError('invalid map elevation')
        water=terrain in ('TERRAIN_COAST','TERRAIN_OCEAN')
        feature=None
        fi=t.get('featureId')
        if fi is not None:
            if not 0<=fi<len(features):raise ParseError('invalid map feature index')
            feature=features[fi]
        wi=t.get('wonderId')
        if wi is not None and wonders is not None:
            if not 0<=wi<len(wonders):raise ParseError('invalid map wonder index')
            feature=wonders[wi]
        output.append({'x':t['x'],'y':t['y'],'terrainId':index,'terrain':terrain,'feature':feature,
                       'landWater':'water' if water else 'land',
                       'elevation':('flat','hills','mountain')[elevation],
                       'owner':None,'ownershipKnown':True,'isLake':None,'riverEdges':t['riverEdges']})
    return output


def base_world(width,height,wrap,tiles,source,civs=None,cities=None,turn=0):
    return {'schemaVersion':'0.1','source':source,'extraction':{'status':'complete','warnings':[],
                'fields':{'tileGeography':'extracted','tileOwnership':'extracted','cities':'extracted'}},
            'game':{'width':width,'height':height,'wrapX':wrap,'wrapY':False,
                    'coordinates':'odd-r-bottom-up','turn':turn},
            'tiles':tiles,'civilizations':civs or [],'cities':cities or []}


def parse_map(data):
    if len(data)>MAX_INPUT:raise ParseError('map input size limit exceeded')
    r=Reader(data); flag=r.unpack('B'); version=flag&15
    if version not in (11,12):raise ParseError(f'unsupported Civ5Map version {version}; requires 11/12')
    width,height=r.unpack('I'),r.unpack('I');dimensions(width,height)
    r.take(1);settings=r.take(4)
    sizes=[r.count(MAX_INPUT) for _ in range(7)]
    terrain,features,wonders,resources=[string_table(r.take(n)) for n in sizes[:4]]
    r.take(sizes[4]);name=cstring(r.take(sizes[5]));description=cstring(r.take(sizes[6]))
    world_size=cstring(r.take(r.count(1_000_000)))
    tiles=[]
    for i in range(width*height):
        tr,res,feat,riv,el,cont,won,amount=r.take(8)
        if res!=255 and res>=len(resources):raise ParseError('invalid map resource index')
        tiles.append({'x':i%width,'y':i//width,'terrainId':tr,'featureId':None if feat==255 else feat,
                      'wonderId':None if won==255 else won,'mapElevation':el,
                      'riverEdges':[e for b,e in ((1,'E'),(2,'SE'),(4,'SW')) if riv&b]})
    tiles=geography(tiles,terrain,features,wonders)
    world=base_world(width,height,bool(settings[0]&1),tiles,{'kind':'map','sha256':hashlib.sha256(data).hexdigest()})
    world['inspection']={'mapVersion':version,'scenario':flag>>4,'mapName':name,'description':description,'worldSize':world_size}
    if r.pos==len(data):
        world['inspection']['gameDataPresent']=False
        return world
    speed=cstring(r.take(64));start,maxturn,score,year=[r.unpack('i') for _ in range(4)]
    major,minor,teams,unused=r.take(4)
    if major>32 or minor>64 or teams>96:raise ParseError('invalid map scenario player counts')
    section_sizes=[r.count(MAX_INPUT) for _ in range(11)]
    tables={}
    for key,n in zip(('improvements','units','techs','policies','buildings','promotions'),section_sizes[:6]):
        tables[key]=string_table(r.take(n))
    units,unit_free=allocator(r.take(section_sizes[6]),48 if version==11 else 84,2)
    unit_names,name_free=allocator(r.take(section_sizes[7]),64)
    city_records,city_free=allocator(r.take(section_sizes[8]),104 if version==11 else 136)
    tables['victories']=string_table(r.take(section_sizes[9]));tables['options']=string_table(r.take(section_sizes[10]))
    r.take(5*((teams*(teams-1)//2+7)//8)+major*64*4+(width*height*teams+7)//8)
    team_names=[cstring(r.take(64)) for _ in range(teams)]
    civs=[]
    for i in range(major+minor):
        record=r.take(436);c=Reader(record,32)
        leader,display,key,color,era,handicap=[cstring(c.take(64)) for _ in range(6)]
        civs.append({'id':i if i<major else 32+i-major,'name':display or key,'key':key,
                     'kind':'major' if i<major else 'city-state','leader':leader,'colorKey':color,'color':None})
    ids={c['id'] for c in civs};cities=[];seen_city=set();seen_unit=set()
    for tile in tiles:
        city,unit=r.unpack('H'),r.unpack('H');owner,improvement,route,route_owner=r.take(4)
        if owner!=255 and owner not in ids:raise ParseError('unknown scenario tile owner')
        if improvement!=255 and improvement>=len(tables['improvements']):raise ParseError('invalid map improvement')
        if route not in (0,1,255):raise ParseError('invalid map route')
        tile.update(owner=None if owner==255 else owner,routeKnown=True,routeId=None if route==255 else route,
                    route=None if route==255 else ('ROUTE_ROAD','ROUTE_RAILROAD')[route],routePillaged=False)
        if city!=65535:
            if city>=len(city_records) or city in city_free or city in seen_city:
                raise ParseError('map tile references missing/freed/duplicate city')
            seen_city.add(city);record=city_records[city];cr=Reader(record,64)
            co,flags,pop=cr.unpack('B'),cr.unpack('B'),cr.unpack('H')
            if co!=owner or tile['landWater']!='land':raise ParseError('scenario city owner/geography mismatch')
            cities.append({'id':f'map:{city}','name':cstring(record[:64]),'owner':owner,
                           'x':tile['x'],'y':tile['y'],'population':pop,'capital':None})
        # Unit stacking follows handles; freed entries are not interpreted as units.
        chain=set()
        while unit!=65535:
            if unit>=len(units) or unit in unit_free or unit in chain or unit in seen_unit:
                raise ParseError('invalid map unit reference/stack')
            chain.add(unit);seen_unit.add(unit);u=Reader(units[unit]);next_unit=u.unpack('H');ni=u.unpack('H')
            if ni!=65535 and (ni>=len(unit_names) or ni in name_free):raise ParseError('invalid map unit name reference')
            unit=next_unit
    if r.pos!=len(data):raise ParseError('unparsed map scenario trailing bytes')
    world.update(civilizations=civs,cities=cities)
    world['game']['turn']=start
    world['inspection'].update(gameDataPresent=True,unitCapacity=len(units),freeUnits=sorted(unit_free),
                              cityCapacity=len(city_records),freeCities=sorted(city_free),teamNames=team_names)
    validate_world(world)
    return world


def upstream_map(document):
    """Read legacy scenario JSON without reassigning scenario owners."""
    m=document['MapData'];h=m['MapHeader'];w,height=h['Width'],h['Height'];dimensions(w,height)
    rows=m['MapTiles']
    if len(rows)!=height or any(len(row)!=w for row in rows):raise ParseError('upstream JSON geography dimensions mismatch')
    raw=[]
    for y,row in enumerate(rows):
        for x,t in enumerate(row):
            raw.append({'x':x,'y':y,'terrainId':t['TerrainType'],'mapElevation':t['Elevation'],
                        'featureId':None if t['FeatureTerrainType'] in (-1,255) else t['FeatureTerrainType'],
                        'riverEdges':[e for b,e in ((1,'E'),(2,'SE'),(4,'SW')) if t['RiverData']&b]})
    tiles=geography(raw,m['TerrainList'],m['FeatureTerrainList'])
    world=base_world(w,height,bool(h['Settings'][0]&1),tiles,{'kind':'map','format':'scenario-json'})
    civs=[]
    owner_by_index={index:int(owner) for owner,index in m.get('CityOwnerIndexMap',{}).items()}
    for c in m.get('Civ5PlayerData',[]):
        index=c['Index'];owner=owner_by_index.get(index,index)
        civs.append({'id':owner,'key':c['CivType'],'name':c.get('CivName') or c['CivType'],
                     'colorKey':c['TeamColor'],'color':None,'kind':'major' if owner<32 else 'city-state'})
    world['civilizations']=civs
    improvements=m.get('MapTileImprovements',[])
    if improvements:
        if len(improvements)!=height or any(len(row)!=w for row in improvements):raise ParseError('upstream JSON improvement dimensions mismatch')
        for t,imp in zip(tiles,(t for row in improvements for t in row)):
            owner=imp['Owner'];t['owner']=None if owner in (-1,255,65535,4294967295) else owner
            if imp.get('CityId',-1)!=-1:
                world['cities'].append({'id':f"map:{imp['CityId']}",'name':imp.get('CityName') or '',
                                        'owner':t['owner'],'x':t['x'],'y':t['y'],'capital':None})
    validate_world(world)
    return world


def load_map(path):
    path=Path(path)
    if path.suffix.lower()=='.civ5map':return parse_map(path.read_bytes())
    if path.suffix.lower()=='.json':
        data=json.loads(path.read_text(encoding='utf-8'))
        if 'MapData' in data:return upstream_map(data)
        validate_world(data);return data
    raise ParseError('base map must be .Civ5Map or normalized/upstream .json')
