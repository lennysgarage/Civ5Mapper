"""Deterministic physical route adjacency; independent of binary parsing.

These edges describe infrastructure, not city trade-route benefits or harbor
connections. Only explicitly known route tiles connect. Wrapping connections
are split at their shared hex edge instead of stretching across the map.
"""


def route_segments(world):
    tiles = {(t['x'],t['y']):t for t in world['tiles']}
    width, height = world['game']['width'], world['game']['height']
    wrap = world['game']['wrapX']
    def has_route(tile):
        return tile.get('routeKnown') is True and (tile.get('routeId') is not None or tile.get('route') is not None)
    seen, result = set(), []
    for (x,y), tile in sorted(tiles.items(),key=lambda p:(p[0][1],p[0][0])):
        if not has_route(tile):
            continue
        shift = y & 1
        for raw_x, ny in ((x-1,y),(x+1,y),(x-1+shift,y-1),(x+shift,y-1),(x-1+shift,y+1),(x+shift,y+1)):
            if not 0 <= ny < height or (not wrap and not 0 <= raw_x < width):
                continue
            nx = raw_x % width if wrap else raw_x
            other = tiles.get((nx,ny))
            if other is None or (nx,ny)==(x,y) or not has_route(other):
                continue
            key = tuple(sorted(((x,y),(nx,ny))))
            if key in seen:
                continue
            seen.add(key)
            types = (tile.get('route'),other.get('route'))
            kind = ('railroad' if all(t=='ROUTE_RAILROAD' for t in types) else
                    'road' if all(t in ('ROUTE_ROAD','ROUTE_RAILROAD') for t in types) else 'route')
            pillaged = tile.get('routePillaged') is True or other.get('routePillaged') is True
            a = (2*x+(y&1),3*y)
            b = (2*raw_x+(ny&1),3*ny)
            info = {'kind':kind,'pillaged':pillaged,'tiles':key}
            if nx != raw_x:
                mid = ((a[0]+b[0])/2,(a[1]+b[1])/2)
                displacement = 2*(nx-raw_x)
                canonical_b = (b[0]+displacement,b[1])
                canonical_mid = (mid[0]+displacement,mid[1])
                result.extend([dict(info,start=a,end=mid),dict(info,start=canonical_b,end=canonical_mid)])
            else:
                result.append(dict(info,start=a,end=b))
    return result
