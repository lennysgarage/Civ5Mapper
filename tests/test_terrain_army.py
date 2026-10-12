import copy
import json
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path
from unittest.mock import patch

from civmapper.extract import read_plot, PROFILES
from civmapper.render import render_svg, army_groups, TERRAIN_COLORS
from civmapper.replay_render import render_replay, prepare
from civmapper.save import Reader, ParseError
from civmapper.units import read_unit, extract_units, UNIT_PROFILES
from test_extraction import plot_bytes
import test_ruleset

NS = {'s':'http://www.w3.org/2000/svg'}


def unit_bytes(profile='bnw-six-yield', owner=0, local_id=8192, x=0, y=0):
    data = struct.pack('<I6i',9,owner,owner,2,x,y,local_id)
    data += bytes(UNIT_PROFILES[profile]-len(data)) + bytes(8)
    for count in [2,3,2,3,2,2,3,3,4,5]:
        data += struct.pack('<I',count)+bytes(count*4)
    data += bytes(24)+struct.pack('<I',zlib.crc32(b'UNIT_TEST')^0xffffffff)+bytes(4)
    data += struct.pack('<3I',1,8,1)+struct.pack('<IB',0x12345678,1)
    return data


class UnitParserTests(unittest.TestCase):
    def test_v9_profiles_identity_hash_and_truncation(self):
        tile={'x':0,'y':0};ref={'owner':0,'localId':8192}
        for profile in UNIT_PROFILES:
            data=unit_bytes(profile)
            unit=read_unit(data,0,len(data),ref,tile,profile)
            self.assertEqual(unit['id'],'0:8192')
            self.assertEqual(unit['unitTypeHash'],f'{zlib.crc32(b"UNIT_TEST")^0xffffffff:08x}')
            self.assertIsNone(unit['isMilitary'])
            for broken in [data[:-1],struct.pack('<I',10)+data[4:]]:
                with self.assertRaises(ParseError):read_unit(broken,0,len(broken),ref,tile,profile)
            with self.assertRaisesRegex(ParseError,'identity'):
                read_unit(data,0,len(data),dict(ref,owner=1),tile,profile)
            with self.assertRaises(ParseError):
                read_unit(data,0,len(data)-1,ref,tile,profile)

    def test_plot_reference_validation(self):
        original=plot_bytes(0,0)
        def record(refs):
            return original[:-29]+struct.pack('<I',len(refs))+b''.join(struct.pack('<ii',*r) for r in refs)+original[-25:]
        tile,diagnostic=read_plot(Reader(record([(1,8192),(2,8192)])),PROFILES['bnw-six-yield'])
        self.assertEqual(diagnostic['unitReferences'],[{'owner':1,'localId':8192},{'owner':2,'localId':8192}])
        for refs in [[(-1,1)],[(1,-1)],[(1,1),(1,1)]]:
            with self.assertRaises(ParseError):read_plot(Reader(record(refs)),PROFILES['bnw-six-yield'])

    def test_unique_owner_interval_join_and_ambiguity(self):
        data=bytes(32)+unit_bytes()
        world={'civilizations':[{'id':0}], 'tiles':[{'x':0,'y':0}], 'cities':[],
               'inspection':{'plots':{'endOffset':0,'records':[{'unitReferences':[{'owner':0,'localId':8192}]}]}},
               'extraction':{'fields':{},'warnings':[]}}
        def anchors(end):
            return [{'id':0,'endOffset':32,'offset':0}]+[{'id':i,'offset':end,'endOffset':end} for i in range(1,64)]
        with patch('civmapper.units.player_anchors',return_value=anchors(len(data))):
            extract_units(world,data,'bnw-six-yield')
        self.assertEqual(len(world['units']),1)
        doubled=data+unit_bytes()
        with patch('civmapper.units.player_anchors',return_value=anchors(len(doubled))),self.assertRaisesRegex(ParseError,'2 validated'):
            extract_units(world,doubled,'bnw-six-yield')
        world['inspection']['plots']['records'][0]['unitReferences']*=2
        with self.assertRaisesRegex(ParseError,'multiple plots'):extract_units(world,data,'bnw-six-yield')

    def test_memoryview_reader_strings(self):
        value='Café'.encode()
        self.assertEqual(Reader(memoryview(struct.pack('<I',len(value))+value)).string(),'Café')


class UnitRulesetTests(unittest.TestCase):
    def setUp(self):
        fixture=test_ruleset.RulesetTests()
        fixture.setUp()
        self.fixture=fixture
        self.addCleanup(fixture.temp.cleanup)
        import sqlite3
        with sqlite3.connect(fixture.path) as db:
            db.executescript("""
                CREATE TABLE Units(Type,Description,Domain,Combat,RangedCombat,NukeDamageLevel);
                INSERT INTO Units VALUES('UNIT_TEST','TXT_UNIT','DOMAIN_LAND',10,0,-1);
                INSERT INTO Units VALUES('UNIT_WORKER','TXT_WORKER','DOMAIN_LAND',0,0,-1);
                INSERT INTO Units VALUES('UNIT_NUKE','TXT_NUKE','DOMAIN_AIR',0,0,0);
                INSERT INTO Language_en_US VALUES('TXT_UNIT','Test Infantry');
            """)
        fixture.world['units']=[]
        for index,key in enumerate(['UNIT_TEST','UNIT_WORKER','UNIT_NUKE']):
            fixture.world['units'].append({'id':str(index),'unitTypeId':999,
                'unitTypeHash':f'{zlib.crc32(key.encode())^0xffffffff:08x}',
                'type':None,'isMilitary':None,'classificationKnown':False})

    def test_hash_resolution_classification_and_database_unchanged(self):
        from civmapper.ruleset import enrich
        fixture=self.fixture
        before=fixture.path.read_bytes()
        result=enrich(fixture.world,fixture.path,fixture.path)
        self.assertEqual([u['isMilitary'] for u in result['units']],[True,False,True])
        self.assertEqual(result['units'][0]['name'],'Test Infantry')
        self.assertTrue(all(u['classificationKnown'] for u in result['units']))
        self.assertEqual(fixture.path.read_bytes(),before)

    def test_wrong_unit_hash_fails(self):
        from civmapper.ruleset import enrich
        self.fixture.world['units'][0]['unitTypeHash']='00000001'
        with self.assertRaisesRegex(ValueError,'unit hash mismatch'):
            enrich(self.fixture.world,self.fixture.path)

    def test_optional_ruleset_class_metadata(self):
        import sqlite3
        from civmapper.ruleset import enrich
        with sqlite3.connect(self.fixture.path) as db:
            db.executescript("ALTER TABLE Units ADD COLUMN CombatClass; ALTER TABLE Units ADD COLUMN Class; UPDATE Units SET CombatClass='UNITCOMBAT_GUN',Class='UNITCLASS_INFANTRY' WHERE Type='UNIT_TEST';")
        world=enrich(self.fixture.world,self.fixture.path)
        self.assertEqual(world['units'][0]['combatClass'],'UNITCOMBAT_GUN')
        self.assertEqual(world['units'][0]['unitClass'],'UNITCLASS_INFANTRY')
        self.assertIsNone(world['units'][1]['combatClass'])


class ModeRenderTests(unittest.TestCase):
    def setUp(self):
        self.world=json.loads(Path('examples/synthetic-world.json').read_text())
        self.world['extraction']['fields']['unitPositions']='extracted'
        # Existing demo majors/minors are kept; choose IDs from the actual roster.
        self.major=next(c['id'] for c in self.world['civilizations'] if c['kind']=='major')
        self.minor=next(c['id'] for c in self.world['civilizations'] if c['kind']=='city-state')
        self.world['units']=[]

    def unit(self,id,owner,military=True,x=0,y=0,domain='DOMAIN_LAND'):
        return {'id':id,'owner':owner,'x':x,'y':y,'isMilitary':military,
                'classificationKnown':True,'type':'UNIT_TEST','name':'Test','domain':domain}

    def test_physical_terrain_unions_not_owner_fills_and_symbols(self):
        for t in self.world['tiles']:
            t['terrain']='TERRAIN_OCEAN' if t['landWater']=='water' else 'TERRAIN_DESERT'
        land=next(t for t in self.world['tiles'] if t['landWater']=='land')
        land['elevation']='hills';land['feature']='FEATURE_OASIS'
        before=copy.deepcopy(self.world)
        svg=render_svg(self.world,mode='physical')
        root=ET.fromstring(svg)
        paths=root.findall('s:path[@data-terrain]',NS)
        self.assertEqual(len(paths),2)
        desert=next(p for p in paths if p.get('data-terrain')=='TERRAIN_DESERT')
        self.assertEqual(desert.get('fill'),TERRAIN_COLORS['TERRAIN_DESERT'])
        self.assertNotIn('class="country"',svg)
        self.assertNotIn('data-owner=',svg)
        self.assertIn('class="hill"',svg)
        self.assertIn('FEATURE_OASIS',svg)
        self.assertEqual(self.world,before)
        self.assertIn('#123456',render_svg(self.world,{'terrainColors':{'TERRAIN_DESERT':'#123456'}},mode='physical'))
        land['terrain']='TERRAIN_MODDED'
        self.assertIn('unmapped terrain color',render_svg(self.world,mode='physical'))

    def test_physical_missing_data_and_invalid_style_fail(self):
        self.world['tiles'][0]['terrain']=None
        with self.assertRaisesRegex(ValueError,'resolved terrain'):render_svg(self.world,mode='physical')
        for style in [{'terrainColors':{'GRASS':'#123456'}},{'terrainColors':{'TERRAIN_GRASS':'bad'}},{'armyMarkerSize':100}]:
            with self.assertRaises(ValueError):render_svg(self.world,style)

    def test_army_stack_counts_filter_civilians_minors_and_show_foreign_navy(self):
        water=next(t for t in self.world['tiles'] if t['landWater']=='water')
        x,y=water['x'],water['y']
        self.world['units']=[self.unit('a',self.major,x=x,y=y,domain='DOMAIN_SEA'),
                             self.unit('b',self.major,x=x,y=y,domain='DOMAIN_SEA'),
                             self.unit('civilian',self.major,False),self.unit('minor',self.minor)]
        before=copy.deepcopy(self.world)
        svg=render_svg(self.world,mode='army')
        markers=ET.fromstring(svg).findall('s:g[@class="army-marker"]',NS)
        self.assertEqual(len(markers),1)
        self.assertEqual(markers[0].get('data-count'),'2')
        self.assertEqual(markers[0].get('data-domain'),'DOMAIN_SEA')
        self.assertEqual(markers[0].get('data-icon'),'naval')
        badge=markers[0].find('s:g[@class="army-stack-count"]/s:text',NS)
        self.assertEqual(badge.text,'2')
        self.assertEqual((markers[0].get('data-x'),markers[0].get('data-y')),(str(x),str(y)))
        self.assertEqual(self.world,before)
        self.world['units'].reverse()
        self.assertEqual(svg,render_svg(self.world,mode='army'))

    def test_single_units_use_domain_symbols_without_numbers(self):
        for domain,icon in [('DOMAIN_LAND','land'),('DOMAIN_SEA','naval'),
                            ('DOMAIN_AIR','air'),('DOMAIN_HOVER','generic')]:
            with self.subTest(domain=domain):
                self.world['units']=[self.unit('single',self.major,domain=domain)]
                root=ET.fromstring(render_svg(self.world,mode='army'))
                marker=root.find('s:g[@class="army-marker"]',NS)
                self.assertEqual(marker.get('data-icon'),icon)
                self.assertEqual(marker.get('data-count'),'1')
                self.assertIsNotNone(marker.find('s:g[@class="army-symbol"]/s:path',NS))
                self.assertEqual(marker.findall('.//s:text',NS),[])

    def test_mixed_domain_stack_uses_generic_symbol(self):
        self.world['units']=[self.unit('land',self.major),
                             self.unit('air',self.major,domain='DOMAIN_AIR')]
        marker=ET.fromstring(render_svg(self.world,mode='army')).find('s:g[@class="army-marker"]',NS)
        self.assertEqual(marker.get('data-icon'),'generic')
        self.assertEqual(marker.get('data-domain'),'mixed')
        self.assertEqual(marker.find('s:g[@class="army-stack-count"]/s:text',NS).text,'2')

    def test_army_unknown_data_duplicates_and_bounds_fail(self):
        self.world.pop('units')
        with self.assertRaisesRegex(ValueError,'extracted unit positions'):render_svg(self.world,mode='army')
        self.world['units']=[self.unit('a',self.major)]
        self.world['units'][0]['classificationKnown']=False
        with self.assertRaisesRegex(ValueError,'military classification'):render_svg(self.world,mode='army')
        self.world['units']=[self.unit('a',self.major)]*2
        with self.assertRaisesRegex(ValueError,'duplicate'):army_groups(self.world)
        self.world['units']=[self.unit('a',self.major,x=999)]
        with self.assertRaisesRegex(ValueError,'coordinate'):army_groups(self.world)

    def test_replay_rejects_historical_armies_and_accepts_physical_base(self):
        replay=json.loads(Path('examples/synthetic-replay.json').read_text())
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)/'frame.svg'
            with self.assertRaisesRegex(ValueError,'historical unit positions'):
                render_replay(replay,output,wrap_x=False,mode='army')
            self.assertFalse(output.exists())
            world,_=prepare(replay,wrap_x=False)
            world['units']=[self.unit('final',self.major)]
            for t in world['tiles']:t['terrain']='TERRAIN_GRASS'
            prepared,_=prepare(replay,base=world)
            self.assertNotIn('units',prepared)
            render_replay(replay,output,base=world,mode='physical',captions=True)
            self.assertIn('data-terrain="TERRAIN_GRASS"',output.read_text())
            self.assertIn('class="replay-captions"',output.read_text())
