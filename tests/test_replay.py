import copy
import io
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from civmapper.save import ParseError, Reader
from civmapper.replay import parse_replay, read_events, save_events, result
from civmapper.mapio import parse_map, allocator, upstream_map, base_world
from civmapper.replay_render import replay_frames, prepare, render_replay
from civmapper.render import render_svg
from civmapper.extract import read_plot, PROFILES
from test_extraction import plot_bytes


def u(n):return struct.pack('<I',n)
def s(value):
    raw=value.encode();return u(len(raw))+raw

def event(turn,kind,owner=0,tiles=((0,0),),text='',extended=False):
    return u(turn)+u(kind)+u(len(tiles))+b''.join(struct.pack('<HH',*p) for p in tiles)+(bytes(12) if extended else b'')+struct.pack('<i',owner)+s(text)


def replay_binary(extended=False):
    b=b'CIV5'+u(1)+s('test')+s('build')+u(3)+b'\0'
    b+=b''.join(s(x) for x in ('CIVILIZATION_TEST','difficulty','era','era','speed','size','Test.Civ5Map'))
    b+=u(0)*2+s('')*3+u(1)+u(0)+s('Test.Civ5Map')+u(0)*5+u(0)*2+struct.pack('<i',-1)+b'\0'
    b+=u(0)+struct.pack('<i',-4000)+u(3)+s('date')+u(0)*2
    b+=u(2)
    for i,name in enumerate(('CIVILIZATION_TEST','MINOR_CIV_TEST')):
        b+=u(i)*4+s('leader')+s(name)+s(name)+s('demonym')
    b+=u(1)+s('Score')+u(2)
    for _ in range(2):b+=u(1)+u(2)+u(0)+u(4)+u(3)+u(10)
    b+=u(2)+u(4)
    b+=event(0,2,0,text='',extended=extended)
    b+=event(0,1,0,text='Alpha is founded.',extended=extended)
    b+=event(2,3,1,text='captured',extended=extended)
    b+=event(3,4,-1,text='razed',extended=extended)
    b+=u(2)+u(1)+u(2)
    for _ in range(2):b+=u(1)+u(3)+bytes((2,0,255,4))
    return b


def map_binary(version=12,scenario=False,freed_city=False):
    terrain=b'TERRAIN_GRASS\0';features=b'FEATURE_FOREST\0'
    sizes=[len(terrain),len(features),0,0,0,5,0]
    b=bytes([version])+u(2)+u(1)+b'\0'+bytes(4)+b''.join(u(n) for n in sizes)
    b+=terrain+features+b'Test\0'+s('size')
    b+=bytes((0,255,255,1,0,0,255,0))*2
    if not scenario:return b
    b+=bytes(64)+u(0)*4+bytes((1,0,1,0))
    citysize=104 if version==11 else 136
    city=bytearray(citysize);city[:6]=b'Alpha\0';struct.pack_into('<BBH',city,64,0,0,5)
    if freed_city:struct.pack_into('<i',city,0,-1)
    sections=[b'',b'',b'',b'',b'',b'',struct.pack('<i',-1),struct.pack('<i',-1),struct.pack('<i',0 if freed_city else -1)+city,b'',b'']
    b+=b''.join(u(len(sec)) for sec in sections)+b''.join(sections)
    b+=bytes(256)+bytes(1)+bytes(64) # influence, visibility, team name
    player=bytearray(436);player[160:178]=b'CIVILIZATION_TEST\0' # preserve record size
    # slice above is 18 bytes and inserted value is 18 bytes
    b+=player
    b+=struct.pack('<HH4B',0,65535,0,255,255,255)
    b+=struct.pack('<HH4B',65535,65535,255,255,255,255)
    return b


class ReplayParserTests(unittest.TestCase):
    def test_empty_replay_has_no_false_profile_ambiguity(self):
        data=replay_binary();parsed=parse_replay(data)
        empty=data[:parsed['inspection']['eventsOffset']]+u(0)+data[-36:]
        r=parse_replay(empty)
        self.assertEqual(r['events'],[]);self.assertEqual(r['inspection']['eventProfile'],'no-events')
        with self.assertRaisesRegex(ValueError,'no events'):list(replay_frames(r,wrap_x=False))
    def test_both_event_profiles_and_datasets_and_geography(self):
        for extended in (False,True):
            replay=parse_replay(replay_binary(extended))
            self.assertEqual(len(replay['events']),4)
            self.assertEqual(replay['datasets'][1]['values']['Score'][1],{'turn':3,'value':10})
            self.assertEqual(replay['tiles'][0]['riverEdges'],['E'])
            self.assertEqual(replay['inspection']['eventProfile'],'lek-extended-12' if extended else 'standard')

    def test_truncations_and_trailing_bytes_fail(self):
        data=replay_binary()
        for broken in (data[:-1],data[:50],data+b'\0'):
            with self.assertRaises(ParseError):parse_replay(broken)
        with self.assertRaises(ParseError):read_events(Reader(u(500001)))
        with self.assertRaises(ParseError):read_events(Reader(u(1)+u(0)*2+u(500001)))

    def test_sentinel_events_and_unknown_types_preserved(self):
        data=u(2)+event(0,0,-1,((65535,65535),),'notice')+event(0,99,0,(),'unknown')
        events=read_events(Reader(data))
        self.assertEqual(events[0]['tiles'][0],{'x':65535,'y':65535})
        self.assertEqual(events[1]['typeId'],99)

    def test_embedded_sequential_header_and_random_event_boundary(self):
        b=u(1)+bytes(29*4+10)+u(0)+bytes(48)+s('')+bytes(1792)
        b+=u(0)*8+bytes(756)+u(0)*4 # special units, rank, destroyed, great people
        b+= (struct.pack('<5iI',0,-1,-1,0,8192,0))*2
        b+=(u(1)+bytes(13))*2+u(2)+u(1)+event(0,0,-1,(),'test')+u(1)+u(0)
        events,evidence=save_events(b)
        self.assertEqual(events[0]['text'],'test');self.assertEqual(evidence['timerBytes'],0)
        with self.assertRaises(ParseError):save_events(u(99)+b[4:])


class MapParserTests(unittest.TestCase):
    def test_map_v11_v12_geography_and_scenario_arrays(self):
        for version in (11,12):
            physical=parse_map(map_binary(version));self.assertEqual(len(physical['tiles']),2)
            scenario=parse_map(map_binary(version,True));self.assertEqual(scenario['cities'][0]['name'],'Alpha')
            self.assertEqual(scenario['tiles'][0]['owner'],0)
            self.assertEqual(scenario['tiles'][0]['riverEdges'],['E'])

    def test_free_list_not_record_count_and_stale_city_rejected(self):
        records,free=allocator(struct.pack('<i',1)+bytes(8)+struct.pack('<i',-1)+bytes(4),8)
        self.assertEqual(len(records),2);self.assertEqual(free,{1})
        with self.assertRaisesRegex(ParseError,'freed'):parse_map(map_binary(scenario=True,freed_city=True))
        with self.assertRaises(ParseError):allocator(struct.pack('<iii',0,1,0),4)

    def test_truncated_invalid_terrain_and_map_version(self):
        data=map_binary()
        for broken in (data[:-1],bytes([10])+data[1:],data[:-16]+bytes([99])+data[-15:]):
            with self.assertRaises(ParseError):parse_map(broken)

    def test_upstream_json_coordinates_and_ownership(self):
        doc={'MapData':{'MapHeader':{'Width':2,'Height':1,'Settings':[0]},
             'TerrainList':['TERRAIN_GRASS'],'FeatureTerrainList':[],
             'MapTiles':[[{'TerrainType':0,'Elevation':0,'FeatureTerrainType':255,'RiverData':0}]*2],
             'Civ5PlayerData':[{'Index':0,'CivType':'CIVILIZATION_TEST','TeamColor':'TEST'}],
             'CityOwnerIndexMap':{'32':0},
             'MapTileImprovements':[[{'Owner':32,'CityId':-1},{'Owner':-1,'CityId':-1}]]}}
        world=upstream_map(doc)
        self.assertEqual(world['civilizations'][0]['id'],32);self.assertEqual(world['tiles'][0]['owner'],32)


class ReplayStateTests(unittest.TestCase):
    def setUp(self):self.replay=parse_replay(replay_binary())

    def test_claim_found_transfer_raze_and_eventful_turn_limit(self):
        frames=list(replay_frames(self.replay,wrap_x=False))
        self.assertEqual([f['game']['turn'] for f in frames],[0,2,3])
        self.assertEqual(frames[0]['cities'][0]['name'],'Alpha')
        self.assertEqual(frames[1]['cities'][0]['owner'],1)
        self.assertEqual(frames[2]['cities'],[])
        self.assertIsNone(frames[2]['tiles'][0]['owner'])
        self.assertFalse(frames[2]['tiles'][0]['routeKnown']) # no guessed raze roads
        self.assertEqual(len(list(replay_frames(self.replay,maxturns=2,wrap_x=False))),2)
        self.assertEqual(self.replay['events'][0]['civId'],0)

    def test_wrong_dimensions_geography_and_coordinates_rejected(self):
        base=parse_map(map_binary())
        self.assertEqual(len(list(replay_frames(self.replay,base))),3)
        base['tiles'][0]['elevation']='mountain'
        with self.assertRaisesRegex(ValueError,'geography mismatch'):prepare(self.replay,base)
        base=parse_map(map_binary());base['game']['width']=3
        with self.assertRaises(ValueError):prepare(self.replay,base)
        self.replay['events'][0]['tiles'][0]['x']=2
        with self.assertRaises(ValueError):prepare(self.replay)

    def test_wrapping_missing_and_filename_and_rivers_warning(self):
        with self.assertRaisesRegex(ValueError,'wrapping'):prepare(self.replay)
        base=parse_map(map_binary());base['tiles'][0]['riverEdges']=[]
        _,warnings=prepare(self.replay,base,'Other.Civ5Map')
        self.assertTrue(any('filename' in w for w in warnings));self.assertTrue(any('River snapshots differ' in w for w in warnings))

    def test_missing_city_claim_fails_without_guessing(self):
        self.replay['events']=self.replay['events'][1:]
        with self.assertRaisesRegex(ValueError,'without logged ownership'):list(replay_frames(self.replay,wrap_x=False))

    def test_json_roundtrip_deterministic_svg(self):
        a=list(replay_frames(self.replay,wrap_x=False,maxturns=1))[0]
        b=list(replay_frames(json.loads(json.dumps(self.replay)),wrap_x=False,maxturns=1))[0]
        self.assertEqual(render_svg(a),render_svg(b))

    def test_gif_header_frames_and_svg_export(self):
        try:
            from PIL import Image
            import cairosvg
        except ImportError:self.skipTest('optional GIF dependencies not installed')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'map.gif'
            report=render_replay(self.replay,path,wrap_x=False)
            self.assertTrue(path.read_bytes().startswith(b'GIF89a'))
            with Image.open(path) as image:self.assertEqual(image.n_frames,3)
            self.assertEqual(len(report['frames']),3)
            again=Path(directory)/'again.gif';render_replay(self.replay,again,wrap_x=False)
            self.assertEqual(path.read_bytes(),again.read_bytes())
            svg=Path(directory)/'last.svg';render_replay(self.replay,svg,wrap_x=False)
            self.assertIn('turn 3',svg.read_text())

    def test_cli_exportjson_and_fail_exit_2_without_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'test.Civ5Replay';source.write_bytes(replay_binary())
            out=Path(directory)/'replay.json'
            proc=subprocess.run([sys.executable,'-m','civmapper','extract-replay',str(source),'-o',str(out)],capture_output=True)
            self.assertEqual(proc.returncode,0,proc.stderr)
            self.assertEqual(len(json.loads(out.read_text())['events']),4)
            proc=subprocess.run([sys.executable,'-m','civmapper','extract-replay',str(source),'-o',str(source)],capture_output=True)
            self.assertEqual(proc.returncode,2);self.assertEqual(source.read_bytes(),replay_binary())


class RiverAndLabelTests(unittest.TestCase):
    def test_presence_flags_independent_of_flow(self):
        data=bytearray(plot_bytes(0,0,0,2));data[45:48]=bytes((1,0,1))
        tile,_=read_plot(Reader(data),PROFILES['bnw-six-yield'])
        self.assertEqual(tile['riverEdges'],['SW','SE'])
        self.assertEqual(tile['riverFlowDirections']['E'],-1)
        data[45]=2
        with self.assertRaisesRegex(ParseError,'river presence'):read_plot(Reader(data),PROFILES['bnw-six-yield'])

    def test_rivers_real_edges_optional_and_city_state_single_label(self):
        world=parse_map(map_binary(scenario=True));world['civilizations'][0]['kind']='city-state'
        world['civilizations'][0]['name']='Alpha';world['cities'][0]['capital']=True
        svg=render_svg(world)
        self.assertIn('class="river"',svg)
        self.assertNotIn('class="country"',svg)
        self.assertEqual(svg.count('>Alpha</text>'),1)
        self.assertIn('class="city-state-label"',svg)
        self.assertIn('class="city-state-capital"',svg)
        self.assertIn('data-kind="city-state"',svg)
        self.assertNotIn('class="empire-capital"',svg)
        self.assertNotIn('class="river"',render_svg(world,{'showRivers':False}))
        with self.assertRaises(ValueError):render_svg(world,{'cityStateLabelColor':'<bad>'})

    def test_unowned_pattern_only_marks_unclaimed_land(self):
        world=parse_map(map_binary(scenario=True))
        before=copy.deepcopy(world)
        svg=render_svg(world)
        import xml.etree.ElementTree as ET
        paths=[e for e in ET.fromstring(svg) if e.get('data-surface')=='land']
        self.assertEqual(next(e for e in paths if e.get('data-owner')=='unowned').get('fill'),'url(#unowned-land)')
        self.assertNotEqual(next(e for e in paths if e.get('data-owner')=='0').get('fill'),'url(#unowned-land)')
        self.assertNotIn('url(#unowned-land)',render_svg(world,{'showUnownedPattern':False}))
        self.assertEqual(world,before)


class DiagnosticsAndScenarioTests(unittest.TestCase):
    def test_unknown_plot_version_stays_candidate_only(self):
        from civmapper.diagnostics import layout_diagnostics
        state=struct.pack('<I',8)+bytes(2000)
        header={'endOffset':0,'width':1,'height':1,'landPlots':0,'ownedPlots':0}
        d=layout_diagnostics(state,header)
        self.assertEqual(d['plotVersion'],8)
        self.assertEqual(d['yieldCountCandidates'],[])
        self.assertTrue(all(p['status']=='rejected' for p in d['profileAttempts']))

    def test_known_plot_grid_supports_yield_candidate(self):
        from civmapper.diagnostics import layout_diagnostics
        state=plot_bytes(0,0)
        header={'endOffset':0,'width':1,'height':1,'landPlots':0,'ownedPlots':0}
        d=layout_diagnostics(state,header)
        self.assertEqual(d['plotVersion'],7)
        self.assertEqual(d['yieldCountCandidates'][0]['count'],6)

    def test_scenario_seed_requires_verified_or_explicit_owner_join(self):
        replay=parse_replay(replay_binary())
        base=parse_map(map_binary(scenario=True))
        world,_=prepare(replay,base)
        self.assertEqual(world['cities'][0]['owner'],0)
        base['civilizations'][0]['key']='UNMATCHED'
        with self.assertRaisesRegex(ValueError,'owner-map'):prepare(replay,base)
        world,_=prepare(replay,base,owner_map={'0':1})
        self.assertEqual(world['cities'][0]['owner'],1)
        self.assertEqual(world['tiles'][0]['owner'],1)

if __name__=='__main__':unittest.main()
