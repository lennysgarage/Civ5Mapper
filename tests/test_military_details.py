import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import test_terrain_army
from civmapper.__main__ import main
from civmapper.military import military_role, military_summary
from civmapper.render import army_groups, render_svg

NS={'s':'http://www.w3.org/2000/svg'}


class MilitaryDetailsTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_terrain_army.ModeRenderTests()
        self.fixture.setUp()
        self.world=self.fixture.world
        self.major=self.fixture.major

    def unit(self,identity,combat_class=None,domain='DOMAIN_LAND',**extra):
        return dict(self.fixture.unit(identity,self.major,domain=domain),combatClass=combat_class,**extra)

    def test_roles_use_ruleset_keys_and_unknowns_fall_back(self):
        cases=[('UNITCOMBAT_MOUNTED','cavalry'),('UNITCOMBAT_SIEGE','artillery'),
               ('UNITCOMBAT_ARMOR','armor'),('UNITCOMBAT_ARCHER','ranged'),
               ('UNITCOMBAT_SUBMARINE','submarine'),('UNITCOMBAT_CARRIER','carrier')]
        for key,role in cases:
            self.assertEqual(military_role(self.unit('x',key)),role)
        self.assertEqual(military_role(self.unit('x','UNITCOMBAT_HELICOPTER',unitClass='UNITCLASS_AIRSHIP')),'airship')
        self.assertEqual(military_role(self.unit('x',None,'DOMAIN_AIR',unitClass='UNITCLASS_GUIDED_MISSILE')),'missile')
        unknown=self.unit('x','UNITCOMBAT_CUSTOM','DOMAIN_SEA',name='Infantry Tank Cavalry')
        self.assertEqual(military_role(unknown),'naval')

    def test_detailed_symbols_mixed_roles_and_legacy_json(self):
        for role,key in [('infantry','UNITCOMBAT_GUN'),('artillery','UNITCOMBAT_SIEGE'),('airship','UNITCOMBAT_HELICOPTER')]:
            unit=self.unit('x',key,unitClass='UNITCLASS_AIRSHIP' if role=='airship' else None)
            self.world['units']=[unit]
            marker=ET.fromstring(render_svg(self.world,{'armyIcons':'detailed'},mode='army')).find('s:g[@class="army-marker"]',NS)
            self.assertEqual(marker.get('data-icon'),role)
            self.assertEqual(marker.findall('.//s:text',NS),[])
        self.world['units']=[self.unit('a','UNITCOMBAT_GUN'),self.unit('b','UNITCOMBAT_SIEGE')]
        marker=ET.fromstring(render_svg(self.world,{'armyIcons':'detailed'},mode='army')).find('s:g[@class="army-marker"]',NS)
        self.assertEqual(marker.get('data-icon'),'generic')
        self.assertEqual(marker.get('data-count'),'2')
        self.world['units']=[self.fixture.unit('old',self.major)]
        self.assertIn('data-icon="land"',render_svg(self.world,{'armyIcons':'detailed'},mode='army'))

    def test_summary_exact_totals_zero_empires_and_unchanged_map(self):
        self.world['units']=[self.unit('a','UNITCOMBAT_GUN'),self.unit('b','UNITCOMBAT_SIEGE'),
                             self.unit('c','UNITCOMBAT_SUBMARINE','DOMAIN_SEA'),
                             self.fixture.unit('civilian',self.major,False),self.fixture.unit('minor',self.fixture.minor)]
        self.world['civilizations'][0]['playerName']='A < B & '+('Long Empire Name '*10)
        before=copy.deepcopy(self.world)
        summary=military_summary(self.world['civilizations'],army_groups(self.world))
        entry=next(e for e in summary if e['owner']==self.major)
        self.assertEqual(entry['total'],3)
        self.assertEqual(entry['categories'],{'infantry':1,'artillery':1,'submarine':1})
        self.assertEqual(sum(e['total'] for e in summary),3)
        self.assertEqual(len(summary),sum(c['kind']=='major' for c in self.world['civilizations']))
        plain=ET.fromstring(render_svg(self.world,mode='army'))
        extended=ET.fromstring(render_svg(self.world,{'showMilitarySummary':True},mode='army'))
        panel=extended.find('s:g[@class="military-summary"]',NS)
        cards=panel.findall('s:g[@class="military-summary-empire"]',NS)
        self.assertEqual(sum(int(c.get('data-total')) for c in cards),3)
        self.assertTrue(any(c.get('data-total')=='0' for c in cards))
        height=float(extended.get('viewBox').split()[3])
        for card in cards:
            rect=card.find('s:rect',NS)
            self.assertLessEqual(float(rect.get('y'))+float(rect.get('height')),height)
        extended.remove(panel);extended.set('viewBox',plain.get('viewBox'))
        self.assertEqual(ET.tostring(extended),ET.tostring(plain))
        self.assertEqual(self.world,before)
        self.world['units'].reverse()
        self.assertEqual(summary,military_summary(self.world['civilizations'],army_groups(self.world)))

    def test_cli_options_and_invalid_mode(self):
        self.world['units']=[self.unit('a','UNITCOMBAT_MOUNTED')]
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'world.json';source.write_text(json.dumps(self.world))
            output=Path(folder)/'army.svg'
            style=Path(folder)/'style.json';style.write_text(json.dumps({'armyIcons':'domain','showMilitarySummary':False}))
            argv=['civmapper','render',str(source),'-o',str(output),'--mode','army','--army-icons','detailed','--military-summary','--style',str(style)]
            with patch.object(sys,'argv',argv),contextlib.redirect_stderr(io.StringIO()):main()
            svg=output.read_text()
            self.assertIn('data-icon="cavalry"',svg)
            self.assertIn('class="military-summary"',svg)
            output.unlink()
            argv[argv.index('army')]='physical'
            with patch.object(sys,'argv',argv),contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:main()
            self.assertEqual(error.exception.code,2)
            self.assertFalse(output.exists())

    def test_render_save_requests_units_and_applies_both_options(self):
        self.world['units']=[self.unit('a','UNITCOMBAT_SIEGE')]
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'game.Civ5Save';source.write_bytes(b'input')
            output=Path(folder)/'army.svg'
            argv=['civmapper','render-save',str(source),'-o',str(output),'--mode','army','--army-icons','detailed','--military-summary','--no-enrichment']
            with patch.object(sys,'argv',argv),patch('civmapper.__main__.extract_bytes',return_value=self.world) as extract,contextlib.redirect_stderr(io.StringIO()):main()
            extract.assert_called_once_with(b'input','auto',include_player_names=True,include_units=True)
            self.assertIn('data-icon="artillery"',output.read_text())
            self.assertIn('class="military-summary"',output.read_text())
            self.assertEqual(source.read_bytes(),b'input')

    def test_summary_omits_known_inactive_slots_but_retains_any_forces(self):
        self.world['civilizations'].extend([
            {'id':80,'kind':'major','capitalEvidence':{'playerAlive':False}},
            {'id':81,'kind':'major','eliminated':True},
            {'id':82,'kind':'major','capitalEvidence':{'playerAlive':True}},
            {'id':83,'kind':'major'},
        ])
        summary=military_summary(self.world['civilizations'],{})
        owners={s['owner'] for s in summary}
        self.assertFalse(owners & {80,81})
        self.assertTrue({82,83} <= owners)
        summary=military_summary(self.world['civilizations'],{(80,0,0):[self.unit('remaining')]})
        self.assertEqual(next(s for s in summary if s['owner']==80)['total'],1)

    def test_style_options_validate_and_summary_with_empty_armies(self):
        for style in [{'armyIcons':'bad'},{'showMilitarySummary':'yes'}]:
            with self.assertRaises(ValueError):render_svg(self.world,style,mode='army')
        with self.assertRaisesRegex(ValueError,'require --mode army'):
            render_svg(self.world,{'showMilitarySummary':True})
        svg=render_svg(self.world,{'showMilitarySummary':True},mode='army')
        self.assertIn('No military units on plots',svg)
        self.assertNotIn('class="army-marker"',svg)
