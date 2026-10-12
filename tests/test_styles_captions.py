import contextlib
import copy
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

from civmapper.__main__ import main
from civmapper.render import render_svg
from civmapper.replay_render import caption_text, replay_frames, replay_steps, render_replay
from civmapper.styles import PRESETS, load_style, style_path


ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://www.w3.org/2000/svg'}


class StyleTests(unittest.TestCase):
    def setUp(self):
        self.world = json.loads((ROOT / 'examples/synthetic-world.json').read_text())
        self.replay = json.loads((ROOT / 'examples/synthetic-replay.json').read_text())

    def test_named_presets_match_examples_and_default(self):
        examples = {'atlas': 'examples/atlas-style.json',
                    'parchment': 'examples/styles/parchment.json',
                    'minimalist': 'examples/styles/minimalist.json'}
        for name, filename in examples.items():
            self.assertEqual(load_style(name), json.loads((ROOT / filename).read_text()))
            self.assertIsNone(style_path(name))
        self.assertIsNone(load_style())
        self.assertEqual(render_svg(self.world), render_svg(self.world, load_style('atlas')))

    def test_list_and_render_from_another_directory(self):
        env = dict(os.environ, PYTHONPATH=str(ROOT))
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-m', 'civmapper', 'styles'],
                                    cwd=directory, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in PRESETS:
                self.assertIn(name, result.stdout)
            result = subprocess.run([sys.executable, '-m', 'civmapper', 'render',
                                     str(ROOT / 'examples/synthetic-world.json'),
                                     '--style', 'parchment', '-o', 'map.svg'],
                                    cwd=directory, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((Path(directory) / 'map.svg').read_text(),
                             render_svg(self.world, load_style('parchment')))

    def test_named_styles_on_all_render_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            source = folder / 'game.Civ5Save'
            source.write_bytes(b'fixture')
            world = folder / 'world.json'
            world.write_text(json.dumps(self.world))
            replay = folder / 'replay.json'
            replay.write_text(json.dumps(self.replay))
            for name in PRESETS:
                for command, inputs in [('render', [str(world)]),
                                        ('render-save', [str(source), '--no-enrichment']),
                                        ('render-replay', ['--replay', str(replay), '--no-wrap-x'])]:
                    output = folder / f'{command}-{name}.svg'
                    with patch.object(sys, 'argv', ['civmapper', command, *inputs,
                                                   '--style', name, '-o', str(output)]), \
                         patch('civmapper.__main__.extract_bytes', return_value=self.world), \
                         contextlib.redirect_stderr(io.StringIO()):
                        main()
                    expected_world = (list(replay_frames(self.replay, wrap_x=False))[-1]
                                      if command == 'render-replay' else self.world)
                    self.assertEqual(output.read_text(), render_svg(expected_world, load_style(name)))

    def test_custom_style_paths_validation_and_overwrite_guard(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            custom = folder / 'atlas'
            custom.write_text('{"showMountains": false}')
            self.assertEqual(load_style(custom), {'showMountains': False})
            self.assertEqual(style_path(custom), custom)
            with self.assertRaisesRegex(ValueError, 'unknown style'):
                load_style(folder / 'missing.json')
            custom.write_text('[]')
            with self.assertRaisesRegex(ValueError, 'object'):
                load_style(custom)
            custom.write_text('{"showMountains": false}')
            before = custom.read_bytes()
            world = folder / 'world.json'
            world.write_text(json.dumps(self.world))
            with patch.object(sys, 'argv', ['civmapper', 'render', str(world), '--style',
                                           str(custom), '-o', str(custom)]), \
                 contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code, 2)
            self.assertEqual(custom.read_bytes(), before)
            custom.write_text('{"borderColor": "bad"}')
            output = folder / 'map.svg'
            with patch.object(sys, 'argv', ['civmapper', 'render', str(world), '--style',
                                           str(custom), '-o', str(output)]), \
                 contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code, 2)
            self.assertFalse(output.exists())


class CaptionTests(unittest.TestCase):
    def setUp(self):
        self.replay = json.loads((ROOT / 'examples/synthetic-replay.json').read_text())
        self.world = json.loads((ROOT / 'examples/synthetic-world.json').read_text())

    def lines(self, replay=None, style=None):
        return [(w['game']['turn'], caption_text(notes, w, style))
                for w, notes in replay_steps(replay or self.replay, wrap_x=False)]

    def test_original_messages_and_input_immutability(self):
        before = copy.deepcopy(self.replay)
        self.assertEqual(self.lines(), [(0, ['Alpha is founded.']), (2, ['captured']), (3, ['razed'])])
        self.assertEqual(self.replay, before)
        self.assertEqual([w for w, notes in replay_steps(self.replay, wrap_x=False)],
                         list(replay_frames(self.replay, wrap_x=False)))

    def test_empty_text_uses_known_transitions_and_label_preference(self):
        self.replay['events'][2]['text'] = ''
        self.replay['events'][3]['text'] = ''
        for civ, name, player in zip(self.replay['civilizations'], ['First Empire', 'Second Empire'], ['Alice', 'Bob']):
            civ.update(kind='major', name=name, playerName=player)
        self.assertEqual(self.lines()[1][1], ['Ownership changed: Alpha — Alice → Bob.'])
        self.assertEqual(self.lines(style={'empireLabels': 'civilization'})[1][1],
                         ['Ownership changed: Alpha — First Empire → Second Empire.'])
        self.assertEqual(self.lines()[2][1], ['City removed: Alpha.'])
        self.replay['events'][1]['text'] = ''
        self.assertEqual(self.lines()[0][1], ['City founded: (0,0).'])

    def test_same_turn_order_and_ignore_non_city_events(self):
        transfer = self.replay['events'][2]
        removal = self.replay['events'][3]
        transfer['turn'] = removal['turn'] = 0
        self.assertEqual(self.lines(), [(0, ['Alpha is founded.', 'captured', 'razed'])])
        notice = copy.deepcopy(transfer)
        notice.update(turn=1, typeId=0, text='War notification')
        self.replay['events'].append(notice)
        for kind in (2, 3, 4, 5, 6, 99):
            ignored = copy.deepcopy(notice)
            ignored['typeId'] = kind
            self.replay['events'].append(ignored)
        self.assertEqual(self.lines()[-1], (1, []))

    def test_claim_updates_existing_city_but_routine_claims_are_ignored(self):
        self.replay['events'][2].update(typeId=2, text='')
        self.assertTrue(self.lines()[1][1][0].startswith('Ownership changed: Alpha'))
        self.assertEqual(len(self.lines()[0][1]), 1)

    def test_footer_preserves_geometry_with_fixed_height(self):
        before = copy.deepcopy(self.world)
        original = ET.fromstring(render_svg(self.world))
        captioned = ET.fromstring(render_svg(self.world, caption_lines=['Alpha founded']))
        original_view = [float(n) for n in original.get('viewBox').split()]
        new_view = [float(n) for n in captioned.get('viewBox').split()]
        self.assertEqual(new_view[:3], original_view[:3])
        self.assertEqual(new_view[3], original_view[3] + 120)
        footer = captioned[-1]
        self.assertEqual(footer.get('class'), 'replay-captions')
        captioned.remove(footer)
        captioned.set('viewBox', original.get('viewBox'))
        self.assertEqual(ET.tostring(captioned), ET.tostring(original))
        self.assertEqual(self.world, before)

    def test_footer_overflow_escaping_and_empty_turn(self):
        messages = ['Café <&> "founded" ' + '山' * 200, 'second', 'third', 'fourth', 'fifth']
        root = ET.fromstring(render_svg(self.world, caption_lines=messages))
        footer = root[-1]
        self.assertEqual(footer.find('s:title', NS).text, '\n'.join(messages))
        events = footer.findall('.//s:text[@class="caption-event"]', NS)
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0].find('s:title', NS).text, messages[0])
        self.assertTrue(events[0].find('s:title', NS).tail.endswith('…'))
        self.assertIn('+2 more major events', ''.join(footer.itertext()))
        empty = render_svg(self.world, caption_lines=[])
        self.assertIn('No major events recorded this turn.', empty)
        for invalid in ('text', [1]):
            with self.assertRaisesRegex(ValueError, 'caption_lines'):
                render_svg(self.world, caption_lines=invalid)

    def test_cli_captions_are_opt_in_and_svg_is_last_selected_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            for flags in ([], ['--captions']):
                output = Path(directory) / 'frame.svg'
                with patch.object(sys, 'argv', ['civmapper', 'render-replay', '--replay',
                                               str(ROOT / 'examples/synthetic-replay.json'),
                                               '--no-wrap-x', '--style', 'minimalist',
                                               '--maxturns', '2', '-o', str(output), *flags]), \
                     contextlib.redirect_stderr(io.StringIO()):
                    main()
                svg = output.read_text()
                self.assertEqual('class="replay-captions"' in svg, bool(flags))
                if flags:
                    self.assertIn('Turn 2', svg)
                    self.assertIn('captured', svg)
                    self.assertNotIn('razed', svg)
                else:
                    world = list(replay_frames(self.replay, wrap_x=False, maxturns=2))[-1]
                    self.assertEqual(svg, render_svg(world, load_style('minimalist')))

    def test_gif_dimensions_timing_count_and_determinism(self):
        try:
            from PIL import Image
            import cairosvg
        except ImportError:
            self.skipTest('optional GIF dependencies not installed')
        with tempfile.TemporaryDirectory() as directory:
            plain = Path(directory) / 'plain.gif'
            first = Path(directory) / 'captions.gif'
            second = Path(directory) / 'again.gif'
            render_replay(self.replay, plain, wrap_x=False, duration=300, scale=1)
            report = render_replay(self.replay, first, wrap_x=False, duration=300, scale=1, captions=True)
            render_replay(self.replay, second, wrap_x=False, duration=300, scale=1, captions=True)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertTrue(first.read_bytes().startswith(b'GIF89a'))
            self.assertEqual(report['frames'][1]['captions'], ['captured'])
            with Image.open(plain) as original, Image.open(first) as captioned:
                self.assertEqual(original.n_frames, captioned.n_frames)
                self.assertEqual(captioned.n_frames, 3)
                self.assertEqual(captioned.width, original.width)
                self.assertEqual(captioned.height, original.height + 120)
                for i in range(captioned.n_frames):
                    captioned.seek(i)
                    self.assertEqual(captioned.info['duration'], 300)
                    self.assertEqual(captioned.size, (original.width, original.height + 120))
