import copy
import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from civmapper.render import render_svg

NS='{http://www.w3.org/2000/svg}'


class WaterAndMountainTests(unittest.TestCase):
    def setUp(self):
        self.world=json.loads(Path('examples/synthetic-world.json').read_text())
        waters=[t for t in self.world['tiles'] if t['landWater']=='water']
        self.claimed=waters[0]
        self.claimed['owner']=self.world['civilizations'][0]['id']
        for tile in waters[1:]:
            tile['owner']=None

    def test_owned_water_separate_from_ocean_and_land(self):
        before=copy.deepcopy(self.world)
        root=ET.fromstring(render_svg(self.world))
        water=[p for p in root.findall(NS+'path') if p.get('data-surface')=='water']
        self.assertEqual(len(water),1)
        self.assertEqual(water[0].get('data-owner'),str(self.claimed['owner']))
        self.assertEqual(water[0].get('fill'),'#699d9f')
        self.assertEqual(root.find(NS+'rect').get('fill'),'#315465')
        self.assertEqual(self.world,before)

    def test_water_style_customization_and_disable(self):
        svg=render_svg(self.world,{'showOwnedWater':False})
        self.assertNotIn('data-surface="water"',svg)
        root=ET.fromstring(render_svg(self.world,{'ownedWaterColor':'#abcdef'}))
        water=[p for p in root.findall(NS+'path') if p.get('data-surface')=='water']
        self.assertEqual(water[0].get('fill'),'#abcdef')

    def test_icons_match_only_actual_mountain_coordinates(self):
        expected={(str(t['x']),str(t['y'])) for t in self.world['tiles'] if t.get('elevation')=='mountain'}
        root=ET.fromstring(render_svg(self.world))
        icons=[e for e in root.findall(NS+'g') if e.get('class')=='mountain']
        self.assertEqual({(e.get('data-x'),e.get('data-y')) for e in icons},expected)
        self.assertTrue(all(len(e.findall(NS+'path'))==2 for e in icons))
        self.assertNotIn('class="mountain"',render_svg(self.world,{'showMountains':False}))

    def test_invalid_mountain_size_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'mountainSize'):
            render_svg(self.world,{'mountainSize':100})
