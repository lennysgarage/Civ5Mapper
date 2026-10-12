import contextlib
import copy
import io
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import test_terrain_army
from civmapper.__main__ import main
from civmapper.html_export import render_html, player_control
from civmapper.render import render_svg


def payload(document):
    return json.loads(re.search(r'<script id="world-data" type="application/json">(.*?)</script>',document,re.S).group(1))


class HTMLExportTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_terrain_army.ModeRenderTests();self.fixture.setUp()
        self.world=self.fixture.world
        for t in self.world['tiles']:t['terrain']='TERRAIN_GRASS' if t['landWater']=='land' else 'TERRAIN_OCEAN'
        self.world['units']=[dict(self.fixture.unit('u',self.fixture.major),combatClass='UNITCOMBAT_MOUNTED')]

    def test_complete_offline_export_and_deterministic_data(self):
        before=copy.deepcopy(self.world)
        document=render_html(self.world,{'armyIcons':'detailed','showMilitarySummary':True},mode='army')
        data=payload(document)
        self.assertEqual(data['mode'],'army')
        self.assertEqual(data['unavailable'],{})
        self.assertEqual(sum(e['total'] for e in data['summary']),1)
        for view in ('political','physical','army'):
            self.assertIn(f'<template id="map-{view}">',document)
        self.assertIn('data-icon="cavalry"',document)
        self.assertNotIn('<script src=',document)
        self.assertNotIn('<link ',document)
        self.assertNotIn('fetch(',document)
        self.assertNotIn('inspection',data['world'])
        self.assertEqual(self.world,before)
        self.world['tiles'].reverse();self.world['units'].reverse();self.world['cities'].reverse();self.world['civilizations'].reverse()
        self.assertEqual(document,render_html(self.world,{'armyIcons':'detailed','showMilitarySummary':True},mode='army'))

    def test_names_and_ids_cannot_escape_json_or_svg(self):
        attack='</script></template><img src=x onerror="alert(1)"> & <tag>\u2028'
        self.world['cities'][0]['name']=attack
        self.world['cities'][0]['id']=attack
        self.world['civilizations'][0]['playerName']=attack
        document=render_html(self.world,mode='army')
        self.assertEqual(next(c for c in payload(document)['world']['cities'] if c['id']==attack)['name'],attack)
        raw=re.search(r'<script id="world-data" type="application/json">(.*?)</script>',document,re.S).group(1)
        self.assertNotIn('<',raw);self.assertNotIn('&',raw)
        self.assertNotIn('<img src=x',document)
        self.assertEqual(document.count('<script'),2)
        for svg in re.findall(r'<template[^>]*>(.*?)</template>',document,re.S):ET.fromstring(svg)

    def test_unavailable_views_are_explicit_and_primary_mode_fails(self):
        self.world.pop('units')
        self.world['tiles'][0]['terrain']=None
        data=payload(render_html(self.world))
        self.assertEqual(set(data['unavailable']),{'physical','army'})
        self.assertIsNone(data['summary'])
        self.assertNotIn('units',data['world'])
        with self.assertRaisesRegex(ValueError,'extracted unit positions'):render_html(self.world,mode='army')
        with self.assertRaisesRegex(ValueError,'resolved terrain'):render_html(self.world,mode='physical')
        self.world['extraction']['status']='partial'
        with self.assertRaisesRegex(ValueError,'complete map'):render_html(self.world)

    def test_city_identity_metadata_and_style_layer_defaults(self):
        document=render_html(self.world,{'showCities':False,'showRoads':False,'showCivilizationNames':False},mode='army')
        data=payload(document)
        self.assertFalse(data['layers']['cities']);self.assertFalse(data['layers']['roads'])
        self.assertFalse(data['layers']['empireLabels'])
        svg=re.search(r'<template id="map-army">(.*?)</template>',document,re.S).group(1)
        root=ET.fromstring(svg);ns={'s':'http://www.w3.org/2000/svg'}
        markers=[n for n in root if n.get('class') in ('capital-marker','city-marker')]
        self.assertEqual(len(markers),len(self.world['cities']))
        for node in markers:
            city=next(c for c in self.world['cities'] if str(c['id'])==node.get('data-city-id'))
            self.assertEqual(node.get('data-owner'),str(city['owner']))
        plain=render_svg(self.world,mode='army')
        self.assertNotIn('data-city-id',plain)
        self.world['cities'].append(dict(self.world['cities'][0],capital=False))
        with self.assertRaisesRegex(ValueError,'unique city IDs'):render_html(self.world)

    def test_player_groups_use_current_status_and_retained_names_by_default(self):
        cases=[({'kind':'major','setupSlotStatus':3},'human'),
               ({'kind':'major','setupSlotStatus':1,'playerName':'Former player'},'human'),
               ({'kind':'major','playerName':'Saved human'},'human'),
               ({'kind':'major','setupSlotStatus':1,'playerName':'Lobby name','turnOneSlotStatus':1},'human'),
               ({'kind':'major','setupSlotStatus':1},'ai'),
               ({'kind':'major','setupSlotStatus':1,'playerName':'  '},'ai'),
               ({'kind':'major','name':'Human-looking civ name'},'unknown'),
               ({'kind':'major','setupSlotStatus':True},'unknown'),
               ({'kind':'major','setupSlotStatus':4},'unknown'),
               ({'kind':'city-state','setupSlotStatus':1,'playerName':'Name'},'other'),
               ({'kind':'barbarian','setupSlotStatus':1},'other')]
        for civ,expected in cases:
            with self.subTest(civ=civ):self.assertEqual(player_control(civ),expected)
        self.world['civilizations'][0].update(setupSlotStatus=1,playerName='Former player')
        data=payload(render_html(self.world,mode='army'))
        self.assertEqual(data['playerControls'][str(self.world['civilizations'][0]['id'])],'human')
        self.assertIn('Player groups</h2>',render_html(self.world))

    def test_cli_json_and_save_html_and_overwrite_guard(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'world.json';source.write_text(json.dumps(self.world))
            output=Path(folder)/'map.html'
            argv=['civmapper','render',str(source),'-o',str(output),'--mode','army','--army-icons','detailed','--military-summary']
            with patch.object(sys,'argv',argv),contextlib.redirect_stderr(io.StringIO()):main()
            self.assertEqual(payload(output.read_text())['summary'][0]['total'],1)
            save=Path(folder)/'game.Civ5Save';save.write_bytes(b'input')
            argv=['civmapper','render-save',str(save),'-o',str(output),'--mode','army','--no-enrichment']
            with patch.object(sys,'argv',argv),patch('civmapper.__main__.extract_bytes',return_value=self.world) as extract,contextlib.redirect_stderr(io.StringIO()):main()
            extract.assert_called_once_with(b'input','auto',include_player_names=True,include_units=True)
            self.assertEqual(save.read_bytes(),b'input')
            argv=['civmapper','render',str(source),'-o',str(source)]
            with patch.object(sys,'argv',argv),contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:main()
            self.assertEqual(error.exception.code,2)
            self.assertEqual(json.loads(source.read_text()),self.world)
