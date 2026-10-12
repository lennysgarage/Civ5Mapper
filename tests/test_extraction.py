import copy
import struct
import unittest
import zlib

from civmapper.extract import PROFILES, read_plots, read_city_candidate
from civmapper.save import ParseError, find_compression, inflate


def plot_bytes(x, y, owner=-1, kind=3, city=None, script='', builds=False):
    """Six-yield fixture with real serialized widths and optional tails."""
    b = bytearray(55)
    struct.pack_into('<Ihh', b, 0, 7, x, y)
    b += struct.pack('<bbb4I', owner, kind, 6 if kind == 3 else 0, 0, 0, 0, 0)
    b += bytes([255] * 10)
    b += struct.pack('<10i', *(list(city or (-1, -1)) + [-1] * 8))
    b += bytes(12+320+80+160+80+1+16+80+320+160+22)
    b += bytes([bool(script)])
    if script:
        raw = script.encode(); b += struct.pack('<I', len(raw)) + raw
    b += struct.pack('<I', int(builds))
    if builds:
        b += struct.pack('<IIh', 1, 0x12345678, 25)
    b += bytes(160) + struct.pack('<I', 0) + bytes(1)
    b += struct.pack('<I5i', 2, 0, -1, -1, -1, -1)
    return bytes(b)


class CompressionTests(unittest.TestCase):
    def test_length_prefixed_chunks_are_removed(self):
        plain = bytes(range(256)) * 500
        compressed = zlib.compress(plain)
        chunks = [compressed[i:i+97] for i in range(0, len(compressed), 97)]
        framed = struct.pack('<I', 2) + b''.join(struct.pack('<I', len(c)) + c for c in chunks)
        decoded, info = find_compression(framed, 0)
        self.assertEqual(decoded, plain)
        self.assertEqual(info['chunkCount'], len(chunks))
        with self.assertRaises(ParseError):
            find_compression(framed[:-1], 0)

    def test_large_chunk_boundaries_preserve_random_payload(self):
        import random
        plain = random.Random(1234).randbytes(180000)
        compressed = zlib.compress(plain)
        framed = struct.pack('<I', 2) + b''.join(struct.pack('<I', len(compressed[i:i+65536])) + compressed[i:i+65536] for i in range(0,len(compressed),65536))
        self.assertEqual(find_compression(framed,0)[0],plain)
        # Direct inflation of framed bytes is invalid; only decoded framing is accepted.
        with self.assertRaises(ParseError):
            inflate(framed, 8)


class PlotTests(unittest.TestCase):
    def test_complete_grid_with_optional_script_and_builds(self):
        state = plot_bytes(0,0) + plot_bytes(1,0,2,2,(2,8192),script='hello',builds=True)
        header = {'endOffset':0,'width':2,'height':1,'landPlots':1,'ownedPlots':1}
        tiles, diagnostics = read_plots(state,header,PROFILES['bnw-six-yield'])
        self.assertEqual(diagnostics['endOffset'],len(state))
        self.assertEqual(tiles[1]['cityReference'],{'owner':2,'localId':8192})
        self.assertIsNone(tiles[0]['owner'])
        self.assertEqual(tiles[1]['landWater'],'land')

    def test_reject_incorrect_coordinates_and_aggregates(self):
        header={'endOffset':0,'width':1,'height':1,'landPlots':0,'ownedPlots':0}
        for state,h in [(plot_bytes(1,0),header),(plot_bytes(0,0),dict(header,landPlots=1))]:
            with self.assertRaises(ParseError):read_plots(state,h,PROFILES['bnw-six-yield'])

    def test_reject_unsupported_version_and_truncated_record(self):
        header={'endOffset':0,'width':1,'height':1,'landPlots':0,'ownedPlots':0}
        for state in (struct.pack('<I',8)+plot_bytes(0,0)[4:],plot_bytes(0,0)[:-1]):
            with self.assertRaises(ParseError):read_plots(state,header,PROFILES['bnw-six-yield'])

    def test_current_city_prefix_preserves_name_and_unknown_capital(self):
        p=PROFILES['bnw-six-yield']; scalars=[0]*p['cityScalars'];scalars[:3]=[8192,1,0];scalars[7]=5
        b=struct.pack('<I',6)+struct.pack('<66i',*scalars)+bytes(10)+struct.pack('<4i',2,-1,2,-1)+bytes(4)
        for _ in range(16):b+=struct.pack('<I6i',6,*([0]*6))
        for _ in range(2):b+=struct.pack('<I5i',5,*([0]*5))
        for _ in range(2):b+=struct.pack('<I',80)+bytes(80)
        name='Renamed & Current';b+=struct.pack('<I',len(name))+name.encode()
        tile={'x':1,'y':0,'cityReference':{'owner':2,'localId':8192}}
        city=read_city_candidate(b,0,p,tile)
        self.assertEqual(city['name'],name)
        self.assertEqual(city['population'],5)
        self.assertIsNone(city['capital'])
        with self.assertRaises(ParseError):read_city_candidate(b,0,p,dict(tile,x=0))


if __name__=='__main__':unittest.main()
