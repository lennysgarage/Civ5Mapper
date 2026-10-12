"""Topology checks independent of SVG serialization details."""
import copy
import json
import unittest
from pathlib import Path
from civmapper.render import polygon_rings, render_svg


def area(ring):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]+ring[:1])) / 2


class GeometryTests(unittest.TestCase):
    def test_union_preserves_hole_and_area(self):
        # Six neighbors enclosing an absent central tile: one outside and one hole.
        tiles = [{'x':x,'y':y} for x,y in ((0,1),(2,1),(1,0),(2,0),(1,2),(2,2))]
        rings = polygon_rings(tiles)
        self.assertEqual(len(rings),2)
        self.assertLess(area(rings[0])*area(rings[1]),0)
        self.assertEqual(abs(sum(area(r) for r in rings)),6*6)

    def test_disconnected_islands_preserve_area(self):
        rings = polygon_rings([{'x':0,'y':0},{'x':5,'y':5}])
        self.assertEqual(len(rings),2)
        self.assertEqual(sum(abs(area(r)) for r in rings),12)

    def test_input_order_does_not_change_svg(self):
        world = json.loads(Path('examples/synthetic-world.json').read_text())
        shuffled = copy.deepcopy(world)
        for key in ('tiles','cities','civilizations'):
            shuffled[key].reverse()
        self.assertEqual(render_svg(world),render_svg(shuffled))

    def test_numeric_capital_is_rejected(self):
        world = json.loads(Path('examples/synthetic-world.json').read_text())
        world['cities'][0]['capital'] = 1
        with self.assertRaisesRegex(ValueError,'capital'):
            render_svg(world)
