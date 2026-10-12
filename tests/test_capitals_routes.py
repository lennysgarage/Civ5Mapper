import copy
import json
import math
import struct
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from civmapper.capitals import PLAYER_PROFILES, read_capital
from civmapper.extract import PROFILES, read_plot
from civmapper.routes import route_segments
from civmapper.render import render_svg
from civmapper.save import ParseError, Reader
from test_extraction import plot_bytes


def capital_fixture(profile_name='bnw-six-yield', current=16385, alive=True):
    profile=PLAYER_PROFILES[profile_name]
    boundary=profile['prefixBytes']
    state=bytearray(boundary+32)
    struct.pack_into('<I5i',state,0,16,0,0,8 if alive else 0,2 if alive else 0,0)
    tail=[0]*profile['tailInts']
    tail[0]=current;tail[4]=20
    index=profile['originalXIndex'];tail[index:index+2]=[0,0]
    struct.pack_into('<'+str(len(tail))+'i',state,boundary-profile['capitalBack'],*tail)
    state[boundary+1]=int(alive)
    world={'inspection':{'plots':{'endOffset':0}},'game':{'width':2,'height':1,'turn':20},
           'cities':[{'id':'0:8192','owner':0,'localId':8192,'population':3},
                     {'id':'0:16385','owner':0,'localId':16385,'population':5}] if alive else [],
           'tiles':[{'owner':0 if alive else None,'landWater':'land'}]*2}
    anchor={'id':0,'offset':boundary}
    return state,anchor,profile,world


class CapitalTests(unittest.TestCase):
    def test_current_capital_join_ignores_original_location_and_founding_order(self):
        for name in PLAYER_PROFILES:
            state,anchor,profile,world=capital_fixture(name)
            result=read_capital(state,anchor,profile,world)
            self.assertEqual(result['capitalCityId'],'0:16385')
            self.assertTrue(result['capitalKnown'])

    def test_unresolved_capital_never_marks_another_owners_same_local_id(self):
        state,anchor,profile,world=capital_fixture(current=999)
        world['cities'].append({'id':'1:999','owner':1,'localId':999,'population':5})
        with self.assertRaisesRegex(ParseError,'current owned city'):
            read_capital(state,anchor,profile,world)

    def test_dead_player_stale_reference_has_no_current_capital(self):
        state,anchor,profile,world=capital_fixture(alive=False,current=8192)
        result=read_capital(state,anchor,profile,world)
        self.assertIsNone(result['capitalCityId'])
        self.assertEqual(result['capitalEvidence']['storedLocalId'],8192)

    def test_prefix_aggregate_and_tail_boundary_checks(self):
        state,anchor,profile,world=capital_fixture()
        world['cities'][0]['population']+=1
        with self.assertRaisesRegex(ParseError,'population'):
            read_capital(state,anchor,profile,world)
        state,anchor,profile,world=capital_fixture()
        struct.pack_into('<i',state,anchor['offset']-profile['capitalBack']+16,21)
        with self.assertRaisesRegex(ParseError,'turn'):
            read_capital(state,anchor,profile,world)


class RouteTests(unittest.TestCase):
    def test_route_id_and_pillage_flag_are_independent(self):
        data=bytearray(plot_bytes(0,0,owner=0,kind=2))
        struct.pack_into('<b',data,55+23,7)
        data[50]=1
        tile,_=read_plot(Reader(data),PROFILES['bnw-six-yield'])
        self.assertEqual(tile['routeId'],7)
        self.assertIsNone(tile['route']) # no invented mod type name
        self.assertTrue(tile['routeKnown'])
        self.assertTrue(tile['routePillaged'])

    def world(self,positions,wrap=False,width=4):
        tiles=[{'x':x,'y':y,'routeKnown':True,'routeId':0,'route':'ROUTE_ROAD','routePillaged':False} for x,y in positions]
        return {'game':{'width':width,'height':3,'wrapX':wrap},'tiles':tiles}

    def test_adjacent_routes_connect_once_and_skip_missing_unknown_routes(self):
        world=self.world([(0,0),(1,0),(3,0)])
        self.assertEqual(len(route_segments(world)),1)
        world['tiles'][1]['routeKnown']=False
        self.assertEqual(route_segments(world),[])
        world['tiles'][1]['routeKnown']=True
        world['tiles'][1]['routeId']=None;world['tiles'][1]['route']=None
        self.assertEqual(route_segments(world),[])

    def test_odd_row_diagonals_and_wrap_seam(self):
        self.assertEqual(len(route_segments(self.world([(1,1),(2,2)]))),1)
        self.assertEqual(len(route_segments(self.world([(1,0),(2,1)]))),0)
        world=self.world([(0,0),(3,0)],wrap=True)
        segments=route_segments(world)
        self.assertEqual(len(segments),2)
        self.assertTrue(all(abs(s['start'][0]-s['end'][0])==1 for s in segments))
        self.assertEqual(route_segments(self.world([(0,0),(3,0)])),[])

    def test_pillaged_and_railroad_classification_does_not_depend_on_owner(self):
        world=self.world([(0,0),(1,0)])
        for t in world['tiles']:t['route']='ROUTE_RAILROAD'
        world['tiles'][0]['owner']=0;world['tiles'][1]['owner']=1
        segments=route_segments(world)
        self.assertEqual(segments[0]['kind'],'railroad')
        world['tiles'][1]['routePillaged']=True
        self.assertTrue(route_segments(world)[0]['pillaged'])


class MarkerRenderTests(unittest.TestCase):
    def setUp(self):
        self.world=json.loads(Path('examples/synthetic-world.json').read_text())

    def test_capital_icons_use_only_explicit_true_and_preserve_world(self):
        self.world['cities'][0]['capital']=None
        expected={(str(c['x']),str(c['y'])) for c in self.world['cities'] if c['capital'] is True}
        before=copy.deepcopy(self.world)
        root=ET.fromstring(render_svg(self.world))
        markers=[e for e in root if e.get('class')=='capital-marker']
        self.assertEqual({(e.get('data-x'),e.get('data-y')) for e in markers},expected)
        self.assertTrue(all(e.find('{http://www.w3.org/2000/svg}polygon') is not None for e in markers))
        self.assertEqual(self.world,before)
        self.assertNotIn('class="capital-marker"',render_svg(self.world,{'showCapitals':False}))

    def test_road_layer_and_toggle_use_known_adjacent_route_tiles(self):
        land=[t for t in self.world['tiles'] if t['landWater']=='land']
        positions={(t['x'],t['y']):t for t in land}
        a=next(t for t in land if (t['x']+1,t['y']) in positions)
        b=positions[a['x']+1,a['y']]
        for t in (a,b):t.update(routeKnown=True,routeId=0,route='ROUTE_ROAD',routePillaged=False)
        svg=render_svg(self.world)
        self.assertEqual(svg.count('class="route road"'),1)
        self.assertNotIn('class="route road"',render_svg(self.world,{'showRoads':False}))
        b['routePillaged']=True
        self.assertIn('data-pillaged="true"',render_svg(self.world))

    def test_capital_star_does_not_change_later_city_projection(self):
        first = copy.deepcopy(self.world['cities'][0])
        first['capital'] = True
        second = dict(first, x=first['x']+1, name='Next city', capital=False)
        self.world['cities'] = [first, second]
        root = ET.fromstring(render_svg(self.world))
        ns = '{http://www.w3.org/2000/svg}'
        capital = next(e for e in root if e.get('class') == 'capital-marker').find(ns+'circle')
        ordinary = next(e for e in root if e.get('class') == 'city-marker')
        self.assertAlmostEqual(float(ordinary.get('cx'))-float(capital.get('cx')),16*math.sqrt(3),places=2)
        self.assertEqual(ordinary.get('cy'),capital.get('cy'))
