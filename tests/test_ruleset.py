import hashlib
import sqlite3
import tempfile
import unittest
import zlib
from pathlib import Path
from civmapper.ruleset import enrich


class RulesetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/'metadata.db'
        with sqlite3.connect(self.path) as db:
            db.executescript('''
                CREATE TABLE Civilizations(ID,Type,Description);
                INSERT INTO Civilizations VALUES(4,'CIV_TEST','TXT_CIV');
                CREATE TABLE Terrains(ID,Type,Water);
                INSERT INTO Terrains VALUES(0,'TERRAIN_GRASS',0);
                CREATE TABLE Features(Type);
                INSERT INTO Features VALUES('FEATURE_TEST');
                CREATE TABLE PlayerColors(Type,PrimaryColor);
                INSERT INTO PlayerColors VALUES('PLAYERCOLOR_TEST','COLOR_TEST');
                CREATE TABLE Colors(Type,Red,Green,Blue);
                INSERT INTO Colors VALUES('COLOR_TEST',0.2,0.4,0.6);
                CREATE TABLE Language_en_US(Tag,Text);
                INSERT INTO Language_en_US VALUES('TXT_CIV','Test Republic');
                INSERT INTO Language_en_US VALUES('TXT_CITY','New Town');
            ''')
        self.world = {'source':{}, 'extraction':{'fields':{}},
                      'civilizations':[{'key':'CIV_TEST','rulesetId':4,'colorKey':'PLAYERCOLOR_TEST'}],
                      'tiles':[{'x':0,'y':0,'terrainId':0,'landWater':'land',
                                'featureHash':f"{zlib.crc32(b'FEATURE_TEST') ^ 0xffffffff:08x}"}],
                      'cities':[{'name':'TXT_CITY','nameKey':'TXT_CITY','capital':None}]}

    def test_resolves_metadata_without_modifying_database_or_unknown_capital(self):
        before = self.path.read_bytes()
        result = enrich(self.world,self.path,self.path)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(result['civilizations'][0]['color'],'#336699')
        self.assertEqual(result['civilizations'][0]['name'],'Test Republic')
        self.assertEqual(result['tiles'][0]['feature'],'FEATURE_TEST')
        self.assertEqual(result['cities'][0]['name'],'New Town')
        self.assertIsNone(result['cities'][0]['capital'])
        self.assertEqual(result['source']['ruleset']['databaseSha256'],hashlib.sha256(before).hexdigest())

    def test_wrong_ruleset_is_rejected(self):
        self.world['civilizations'][0]['rulesetId'] = 5
        with self.assertRaisesRegex(ValueError,'civilization ID mismatch'):
            enrich(self.world,self.path)

    def test_wrong_water_classification_is_rejected(self):
        self.world['tiles'][0]['landWater'] = 'water'
        with self.assertRaisesRegex(ValueError,'terrain mismatch'):
            enrich(self.world,self.path)

    def test_missing_localization_preserves_key(self):
        self.world['cities'][0]['nameKey'] = 'TXT_MISSING'
        enrich(self.world,localization=self.path)
        self.assertEqual(self.world['cities'][0]['name'],'TXT_CITY')
        self.assertNotIn('nameSource',self.world['cities'][0])

    def test_routes_resolve_using_matching_database_not_fixed_ids(self):
        with sqlite3.connect(self.path) as db:
            db.executescript("CREATE TABLE Routes(ID,Type); INSERT INTO Routes VALUES(7,'ROUTE_ROAD');")
        self.world['tiles'][0].update(routeKnown=True,routeId=7,route=None,routePillaged=False)
        enrich(self.world,self.path)
        self.assertEqual(self.world['tiles'][0]['route'],'ROUTE_ROAD')
        self.assertEqual(self.world['extraction']['fields']['routes'],'extracted')

    def test_missing_ruleset_route_is_rejected(self):
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE Routes(ID,Type)')
        self.world['tiles'][0].update(routeKnown=True,routeId=7,route=None,routePillaged=False)
        with self.assertRaisesRegex(ValueError,'route mismatch'):
            enrich(self.world,self.path)
