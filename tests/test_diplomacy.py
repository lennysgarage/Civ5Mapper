import copy
import json
import struct
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from civmapper.diplomacy import read_minor_ai, player_anchors, add_alliances
from civmapper.render import render_svg, boundary_edges
from civmapper.save import ParseError, read_header, display_player_name
from test_experiment import synthetic_save


def i(n):
    return struct.pack('<i', n)


def minor_record(ally=0, extra=0, since=10):
    # A version-1 record with a real quest and fixed-size SDK arrays.
    data = b''.join(i(n) for n in (1,0,0,-1,-1,0,ally,since,-1))
    data += bytes(22) + i(-1)*(22*22) + bytes(22) + bytes(extra)
    data += i(9000)+i(0)*21 + bytes(11*22*4) + bytes(4*22+2*80)
    data += i(1)+b''.join(i(n) for n in (2,11,8,100,-1))+b'\x00'+i(0)*21
    return data+b'\x00'+i(1) # notification flag and next DealAI version


def identity(owner, yields=6):
    return bytes(11)+i(0)+bytes(3)+i(-1)+bytes(2)+i(owner)+i(0)+(i(yields)+bytes(yields*4))*10


class DiplomacyTests(unittest.TestCase):
    def test_nickname_display_suffix_and_opt_in(self):
        self.assertEqual(display_player_name('A&B@76561198000000000'),'A&B')
        self.assertEqual(display_player_name('Name Without Suffix'),'Name Without Suffix')
        self.assertIsNone(display_player_name(''))
        with self.assertRaises(ParseError):
            display_player_name('bad\nname')
        data=synthetic_save(mode=1)
        _,roster=read_header(data)
        self.assertNotIn('playerName',roster[0])
        _,roster=read_header(data,include_player_names=True)
        self.assertEqual(roster[0]['playerName'],'private nickname')

    def test_alliance_is_decoded_from_reference_not_highest_influence(self):
        data=minor_record(ally=1)
        result=read_minor_ai(data,0,len(data),20,0)
        self.assertEqual(result['ally'],1) # fixture influence for slot 0 is higher
        self.assertTrue(result['allianceKnown'])
        self.assertEqual(result['allianceSinceTurn'],10)

    def test_unallied_is_distinct_from_unknown(self):
        data=minor_record(ally=-1,since=-1)
        result=read_minor_ai(data,0,len(data),20,0)
        self.assertIsNone(result['ally'])
        self.assertTrue(result['allianceKnown'])

    def test_seven_yield_extra_arrays_and_truncation(self):
        data=minor_record(extra=592)
        self.assertEqual(read_minor_ai(data,0,len(data),20,592)['ally'],0)
        with self.assertRaises(ParseError):
            read_minor_ai(data,0,len(data)-1,20,592)
        with self.assertRaises(ParseError):
            read_minor_ai(minor_record(ally=22),0,len(minor_record()),20,0)
        with self.assertRaises(ParseError):
            read_minor_ai(minor_record(since=21),0,len(minor_record()),20,0)

    def test_player_anchor_requires_all_slots_and_city_consistency(self):
        data=b''.join(identity(n)+bytes(8) for n in range(64))
        anchors=player_anchors(data,0,6,[])
        self.assertEqual(len(anchors),64)
        with self.assertRaises(ParseError):
            player_anchors(data[:anchors[-1]['offset']],0,6,[])
        city={'owner':1,'evidence':{'offset':anchors[0]['endOffset'],'nameEndOffset':anchors[0]['endOffset']+1}}
        with self.assertRaisesRegex(ParseError,'city record'):
            player_anchors(data,0,6,[city])

    def test_optional_missing_diplomacy_leaves_unknown(self):
        world={'civilizations':[{'id':22,'kind':'city-state'}], 'cities':[],
               'inspection':{'plots':{'endOffset':0}},'extraction':{'fields':{},'warnings':[]}}
        add_alliances(world,b'',6)
        self.assertFalse(world['civilizations'][0]['allianceKnown'])
        self.assertIsNone(world['civilizations'][0]['ally'])
        self.assertEqual(world['extraction']['fields']['cityStateAlliances'],'unavailable')

    def test_ambiguous_records_are_not_guessed(self):
        world={'civilizations':[{'id':0,'kind':'major'},{'id':22,'kind':'city-state'}], 'cities':[],
               'game':{'turn':20},'inspection':{'plots':{'endOffset':0}},'extraction':{'fields':{},'warnings':[]}}
        data=b''.join(identity(n)+(minor_record()*2 if n==22 else bytes(8)) for n in range(64))
        add_alliances(world,data,6)
        self.assertFalse(world['civilizations'][1]['allianceKnown'])
        self.assertTrue(any('2 valid records' in w for w in world['extraction']['warnings']))


class AllianceRenderTests(unittest.TestCase):
    def setUp(self):
        self.world=json.loads(Path('examples/synthetic-world.json').read_text())
        self.major,self.minor=self.world['civilizations'][:2]
        self.major.update(playerName='A&B',kind='major',color='#204060')
        self.minor.update(kind='city-state',ally=self.major['id'],allianceKnown=True,color='#000000')

    def fills(self,svg):
        return {e.attrib['data-owner']:e.attrib['fill'] for e in ET.fromstring(svg) if 'data-owner' in e.attrib}

    def test_names_and_shading_keep_world_and_borders_unchanged(self):
        original=copy.deepcopy(self.world)
        borders=boundary_edges(self.world)
        svg=render_svg(self.world)
        self.assertIn('A&amp;B',svg)
        self.assertIn('allied with A&amp;B',svg)
        self.assertEqual(self.fills(svg)[str(self.minor['id'])],'#6E8398')
        self.assertEqual(self.world,original)
        self.assertEqual(boundary_edges(self.world),borders)

    def test_unverified_relationship_is_not_shaded(self):
        self.minor['allianceKnown']=False
        self.assertEqual(self.fills(render_svg(self.world))[str(self.minor['id'])],'#000000')
        self.minor['allianceKnown']=True
        self.assertEqual(self.fills(render_svg(self.world,{'shadeAlliedCityStates':False}))[str(self.minor['id'])],'#000000')

    def test_style_override_and_civilization_label_mode(self):
        svg=render_svg(self.world,{'empireLabels':'civilization','colorOverrides':{str(self.minor['id']):'#123456'}})
        self.assertNotIn('A&amp;B',svg)
        self.assertEqual(self.fills(svg)[str(self.minor['id'])],'#123456')

    def test_invalid_alliance_reference_rejected(self):
        self.minor['ally']=999
        with self.assertRaisesRegex(ValueError,'ally reference'):
            render_svg(self.world)
