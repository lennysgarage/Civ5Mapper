import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from civmapper.player_history import add_turn_one_players,load_turn_one_players
from civmapper.html_export import player_control
from civmapper.__main__ import main
import test_html_export


class PlayerHistoryTests(unittest.TestCase):
    def setUp(self):
        fixture=test_html_export.HTMLExportTests();fixture.setUp()
        self.world=fixture.world
        self.world['source'].update(kind='save',sha256='a'*64)
        self.world['game']['turn']=132
        self.reference=copy.deepcopy(self.world)
        self.reference['source']['sha256']='b'*64
        self.reference['game']['turn']=1
        self.majors=[c for c in self.world['civilizations'] if c['kind']=='major']
        for c in self.majors:c.update(setupSlotStatus=1,playerName='Retained lobby or player name')
        for i,c in enumerate(c for c in self.reference['civilizations'] if c['kind']=='major'):
            c['setupSlotStatus']=1 if i==0 else 3

    def test_snapshot_groups_survive_ai_takeover_and_json_roundtrip(self):
        before=copy.deepcopy(self.reference)
        result=add_turn_one_players(self.world,self.reference)
        self.assertIs(result,self.world)
        self.assertEqual([player_control(c) for c in self.majors],['human','human'])
        self.assertEqual([c['turnOneSlotStatus'] for c in self.majors],[1,3])
        self.assertTrue(all(c['setupSlotStatus']==1 for c in self.majors))
        self.assertEqual(self.world['game']['turnOnePlayerEvidence']['sourceSha256'],'b'*64)
        restored=json.loads(json.dumps(self.world))
        self.assertEqual([player_control(c) for c in restored['civilizations'] if c['kind']=='major'],['human','human'])
        self.assertEqual(self.reference,before)

    def test_lobby_and_mismatches_fail_before_mutation(self):
        changes=[('lobby',lambda r:r['game'].update(turn=0)),
                 ('later',lambda r:r['game'].update(turn=2)),
                 ('geography',lambda r:r['tiles'][0].update(terrainId=999)),
                 ('roster',lambda r:r['civilizations'][0].update(key='CIVILIZATION_OTHER')),
                 ('invalid status',lambda r:r['civilizations'][0].update(setupSlotStatus=True))]
        before=copy.deepcopy(self.world)
        for name,change in changes:
            with self.subTest(name=name):
                reference=copy.deepcopy(self.reference);change(reference)
                with self.assertRaises(ValueError):add_turn_one_players(self.world,reference)
                self.assertEqual(self.world,before)

    def test_unknown_status_and_script_check(self):
        self.reference['civilizations'][0].pop('setupSlotStatus')
        add_turn_one_players(self.world,self.reference)
        self.assertIsNone(self.majors[0]['turnOneSlotStatus'])
        self.assertEqual(player_control(self.majors[0]),'human')
        self.assertEqual(self.world['extraction']['fields']['turnOnePlayerGroups'],'partial')
        self.world['inspection']={'header':{'mapScript':'one.lua'}}
        self.reference['inspection']={'header':{'mapScript':'two.lua'}}
        with self.assertRaisesRegex(ValueError,'map script mismatch'):add_turn_one_players(self.world,self.reference)

    def test_cli_supplied_reference_and_input_protection(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'world.json';source.write_text(json.dumps(self.world))
            reference=Path(folder)/'turn1.Civ5Save';reference.write_bytes(b'reference')
            output=Path(folder)/'map.html'
            argv=['civmapper','render',str(source),'-o',str(output),'--turn-one-save',str(reference),'--mode','army']
            with patch.object(sys,'argv',argv),patch('civmapper.player_history.extract_bytes',return_value=self.reference) as extract,contextlib.redirect_stderr(io.StringIO()):main()
            extract.assert_called_once_with(b'reference',include_player_names=False)
            data=test_html_export.payload(output.read_text())
            self.assertEqual(data['playerControls'][str(self.majors[0]['id'])],'human')
            self.assertEqual(data['playerControls'][str(self.majors[1]['id'])],'human')
            self.assertEqual(json.loads(source.read_text()),self.world)
            self.assertEqual(reference.read_bytes(),b'reference')
            argv[argv.index(str(output))]=str(reference)
            with patch.object(sys,'argv',argv),patch('civmapper.player_history.extract_bytes') as extract,contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:main()
            self.assertEqual(error.exception.code,2);extract.assert_not_called()

    def test_loader_rejects_non_save_reference(self):
        with self.assertRaisesRegex(ValueError,'must be a .Civ5Save'):
            load_turn_one_players(self.world,'reference.json')
