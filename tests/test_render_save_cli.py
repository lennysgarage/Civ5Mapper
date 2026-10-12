import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from civmapper.__main__ import main
from civmapper.render import render_svg


class RenderSaveCLITests(unittest.TestCase):
    def test_extract_and_svg_render_match_existing_renderer(self):
        world=json.loads(Path('examples/synthetic-world.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'game.Civ5Save';source.write_bytes(b'input')
            output=Path(directory)/'map.svg'
            with patch.object(sys,'argv',['civmapper','render-save',str(source),'-o',str(output),'--no-enrichment']),patch('civmapper.__main__.extract_bytes',return_value=copy.deepcopy(world)) as extract,contextlib.redirect_stderr(io.StringIO()):
                main()
            self.assertEqual(output.read_text(),render_svg(world))
            extract.assert_called_once_with(b'input','auto',include_player_names=True)
            self.assertEqual(source.read_bytes(),b'input')

    def test_same_input_output_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'game.Civ5Save';source.write_bytes(b'input')
            with patch.object(sys,'argv',['civmapper','render-save',str(source),'-o',str(source),'--no-enrichment']),patch('civmapper.__main__.extract_bytes') as extract,contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code,2);extract.assert_not_called()
            self.assertEqual(source.read_bytes(),b'input')

    def test_mode_defaults_and_army_unit_extraction(self):
        world=json.loads(Path('examples/synthetic-world.json').read_text())
        try:import cairosvg
        except ImportError:self.skipTest('optional PNG dependency not installed')
        previous=Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('game.Civ5Save').write_bytes(b'input')
                Path('artifacts').mkdir()
                Path('artifacts/game.png').write_bytes(b'existing political map')
                for mode in ('physical','army'):
                    with self.subTest(mode=mode),patch.object(sys,'argv',['civmapper','render-save','game.Civ5Save','--mode',mode,'--no-enrichment']),patch('civmapper.__main__.extract_bytes',return_value=world) as extract,patch('civmapper.__main__.render_svg',return_value='<svg/>') as render,patch.object(cairosvg,'svg2png') as png,contextlib.redirect_stderr(io.StringIO()):
                        main()
                    options={'include_units':True} if mode=='army' else {}
                    extract.assert_called_once_with(b'input','auto',include_player_names=True,**options)
                    self.assertEqual(render.call_args.kwargs['mode'],mode)
                    self.assertEqual(png.call_args.kwargs['write_to'],f'artifacts/game-{mode}.png')
                self.assertEqual(Path('artifacts/game.png').read_bytes(),b'existing political map')
            finally:os.chdir(previous)

    def test_army_without_unit_evidence_exits_two(self):
        world=json.loads(Path('examples/synthetic-world.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'game.Civ5Save';source.write_bytes(b'input')
            output=Path(directory)/'army.svg'
            with patch.object(sys,'argv',['civmapper','render-save',str(source),'--mode','army','-o',str(output),'--no-enrichment']),patch('civmapper.__main__.extract_bytes',return_value=world),contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code,2)
            self.assertFalse(output.exists())

    def test_default_output_and_local_cache_selection(self):
        world=json.loads(Path('examples/synthetic-world.json').read_text())
        try:import cairosvg
        except ImportError:self.skipTest('optional PNG dependency not installed')
        previous=Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('game.Civ5Save').write_bytes(b'input')
                cache=Path('artifacts/ruleset');cache.mkdir(parents=True)
                (cache/'Civ5DebugDatabase.db').write_bytes(b'db')
                with patch.object(sys,'argv',['civmapper','render-save','game.Civ5Save']),patch('civmapper.__main__.extract_bytes',return_value=world),patch('civmapper.__main__.enrich',return_value=world) as enrich,contextlib.redirect_stderr(io.StringIO()):
                    main()
                self.assertTrue(Path('artifacts/game.png').read_bytes().startswith(b'\x89PNG'))
                enrich.assert_called_once_with(world,cache/'Civ5DebugDatabase.db',None)
                self.assertFalse(Path('artifacts/game.json').exists())
            finally:os.chdir(previous)
