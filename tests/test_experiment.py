import copy
import json
import sqlite3
import struct
import unittest
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

from civmapper.save import ParseError, Reader, find_map_header, inflate, inspect_bytes
from civmapper.render import boundary_edges, render_svg, validate_world
from civmapper.extract import extract_bytes


def u(n):
    return struct.pack('<I', n)


def string(s):
    b = s.encode()
    return u(len(b)) + b


def strings(items):
    return u(len(items)) + b''.join(string(s) for s in items)


def synthetic_save(mode=0, terminated=True):
    header = b'CIV5' + u(8) + string('1.0.3.279 (403694)') + string('403694') + u(132) + bytes([mode])
    header += b''.join(string(s) for s in ('CIVILIZATION_TEST', 'HANDICAP_PRINCE', 'ERA_ANCIENT',
                                          'ERA_MODERN', 'GAMESPEED_QUICK', 'WORLDSIZE_SMALL', 'Test.lua'))
    header += u(0) + u(0)  # DLC, mods
    header += string('') * 3 + bytes(16) + string('1.0.0') + bytes(16) + u(0) + u(3) + u(3) + u(2) + string('Test.lua')
    header += u(1) + u(7) + strings(['private nickname'])
    header += (u(1) + u(3)) * 4
    header += strings(['CIVILIZATION_TEST']) + strings(['LEADER_TEST']) + u(6)
    with sqlite3.connect(':memory:') as db:
        db.execute('PRAGMA page_size=1024')
        db.execute('CREATE TABLE SimpleValues(Name TEXT Primary Key, Value VARIANT)')
        blob = db.serialize()
    map_header = struct.pack('<8i2B', 1, 4, 3, 8, 6, 0, 90, -90, 1, 0) + bytes(16) + u(0) + u(0)
    state = u(1) + u(0) + u(132) + bytes(40) + u(len(blob)) + blob + map_header + b'undecoded tile records'
    compressor = zlib.compressobj()
    compressed = compressor.compress(state) + compressor.flush(zlib.Z_FINISH if terminated else zlib.Z_SYNC_FLUSH)
    return header + u(2) + u(len(compressed)) + compressed


class SaveTests(unittest.TestCase):
    def test_header_and_map_anchor_singleplayer_multiplayer(self):
        for mode in (0, 1, 2):
            result, _ = inspect_bytes(synthetic_save(mode))
            self.assertEqual(result['game']['width'], 4)
            self.assertEqual(result['game']['height'], 3)
            self.assertTrue(result['game']['wrapX'])
            self.assertEqual(result['inspection']['header']['modeId'], mode)
            self.assertIsNone(result['tiles'])
            self.assertIsNone(result['cities'])
            self.assertEqual(result['civilizations'][0]['id'], 0)
            self.assertNotIn('private nickname', json.dumps(result))

    def test_unterminated_stream_is_explicit(self):
        result, _ = inspect_bytes(synthetic_save(terminated=False))
        self.assertFalse(result['inspection']['compression']['endMarkerPresent'])
        self.assertTrue(any('truncation' in w for w in result['extraction']['warnings']))

    def test_setup_state_turn_mismatch_is_rejected(self):
        data = synthetic_save().replace(u(132), u(133), 1)
        with self.assertRaisesRegex(ParseError, 'turn mismatch'):
            extract_bytes(data)

    def test_bad_signature_and_unsupported_version(self):
        for data in (b'BAD!' + bytes(20), b'CIV5' + u(7)):
            with self.assertRaises(ParseError):
                inspect_bytes(data)

    def test_truncated_and_oversized_fields(self):
        for data in (u(100) + b'abc', u(1_000_001)):
            with self.assertRaises(ParseError):
                Reader(data).string()

    def test_expansion_limit(self):
        with self.assertRaisesRegex(ParseError, 'exceeds'):
            inflate(zlib.compress(b'x' * 10000), 0, 100)

    def test_corrupt_zlib_checksum_rejected(self):
        data = bytearray(zlib.compress(b'x' * 100))
        data[-1] ^= 1
        with self.assertRaises(ParseError):
            inflate(bytes(data), 0)

    def test_missing_map_anchor_keeps_partial_header(self):
        data = synthetic_save()
        marker = data.index(b'\x78\x9c')
        replacement = zlib.compress(u(1) + bytes(100))
        data = data[:marker-4] + u(len(replacement)) + replacement
        result, _ = inspect_bytes(data)
        self.assertIsNone(result['game']['width'])
        self.assertEqual(result['game']['turn'], 132)

    def test_ambiguous_database_anchors_rejected(self):
        _, state = inspect_bytes(synthetic_save())
        with self.assertRaisesRegex(ParseError, 'found 2'):
            find_map_header(state + state)


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.world = json.loads(Path('examples/synthetic-world.json').read_text())

    def test_valid_svg_and_deterministic(self):
        svg = render_svg(self.world)
        self.assertEqual(svg, render_svg(copy.deepcopy(self.world)))
        self.assertEqual(ET.fromstring(svg).tag, '{http://www.w3.org/2000/svg}svg')
        self.assertIn('SYNTHETIC DEMO', svg)

    def test_refuse_partial(self):
        partial, _ = inspect_bytes(synthetic_save())
        with self.assertRaisesRegex(ValueError, 'partial'):
            render_svg(partial)

    def test_duplicate_coordinate_and_unknown_owner(self):
        self.world['tiles'][1] = self.world['tiles'][0].copy()
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            validate_world(self.world)
        self.setUp()
        self.world['tiles'][0]['owner'] = 99
        with self.assertRaisesRegex(ValueError, 'unknown owner'):
            validate_world(self.world)

    def test_escape_text(self):
        self.world['cities'][0]['name'] = '<script>&'
        svg = render_svg(self.world)
        self.assertIn('&lt;script&gt;&amp;', svg)
        self.assertNotIn('<script>', svg)

    def test_shared_edges_odd_rows_and_wrap_seam(self):
        def world(tiles, wrap=False):
            return {'game': {'width': 4, 'wrapX': wrap}, 'tiles': tiles}
        def tile(x, y, owner=0):
            return {'x': x, 'y': y, 'landWater': 'land', 'owner': owner}
        # Two touching hexes have 10 external edges and no internal border.
        for pair in ([tile(0, 0), tile(1, 0)], [tile(0, 0), tile(0, 1)], [tile(1, 1), tile(1, 2)]):
            self.assertEqual(len(boundary_edges(world(pair))), 10)
        pair = [tile(0, 0), tile(3, 0)]
        self.assertEqual(len(boundary_edges(world(pair, True))), 10)
        self.assertEqual(len(boundary_edges(world(pair))), 12)
        pair[1]['owner'] = 1
        self.assertEqual(sum(e[0] == 'border' for e in boundary_edges(world(pair, True))), 2)


if __name__ == '__main__':
    unittest.main()
