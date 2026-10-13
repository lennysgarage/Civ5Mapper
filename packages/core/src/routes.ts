// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
/** Deterministic physical route adjacency; independent of binary parsing.

These edges describe infrastructure, not city trade-route benefits or harbor
connections. Only explicitly known route tiles connect. Wrapping connections
are split at their shared hex edge instead of stretching across the map.
 */
export function route_segments(world: any): any {
  let a: any,
    b: any,
    canonical_b: any,
    canonical_mid: any,
    displacement: any,
    height: any,
    info: any,
    key: any,
    kind: any,
    mid: any,
    nx: any,
    ny: any,
    other: any,
    pillaged: any,
    raw_x: any,
    result: any,
    seen: any,
    shift: any,
    tile: any,
    tiles: any,
    types: any,
    width: any,
    wrap: any,
    x: any,
    y: any;
  tiles = (() => {
    const __v1: any[] = [];
    for (const __v2 of compat.iter(compat.get(world, "tiles"))) {
      let t: any = __v2;
      __v1.push([[compat.get(t, "x"), compat.get(t, "y")], t]);
    }
    return compat.dict(__v1);
  })();
  {
    const __v3 = compat.iter([
      compat.get(compat.get(world, "game"), "width"),
      compat.get(compat.get(world, "game"), "height"),
    ]);
    width = __v3[0];
    height = __v3[1];
  }
  wrap = compat.get(compat.get(world, "game"), "wrapX");
  function has_route(tile: any): any {
    return compat.and(
      () => compat.get(tile, "routeKnown", null) === true,
      () =>
        compat.or(
          () => compat.get(tile, "routeId", null) !== null,
          () => compat.get(tile, "route", null) !== null,
        ),
    );
  }
  {
    const __v4 = compat.iter([compat.set(), []]);
    seen = __v4[0];
    result = __v4[1];
  }
  for (const __v5 of compat.iter(
    compat.sorted(
      compat.items(tiles),
      compat.dict([
        [
          "key",
          (p: any) => [
            compat.get(compat.get(p, 0), 1),
            compat.get(compat.get(p, 0), 0),
          ],
        ],
      ]),
    ),
  )) {
    {
      const __v6 = compat.iter(__v5);
      {
        const __v7 = compat.iter(__v6[0]);
        x = __v7[0];
        y = __v7[1];
      }
      tile = __v6[1];
    }
    if (compat.truth(!compat.truth(has_route(tile)))) {
      continue;
    }
    shift = compat.bitAnd(y, 1);
    for (const __v8 of compat.iter([
      [compat.sub(x, 1), y],
      [compat.add(x, 1), y],
      [compat.add(compat.sub(x, 1), shift), compat.sub(y, 1)],
      [compat.add(x, shift), compat.sub(y, 1)],
      [compat.add(compat.sub(x, 1), shift), compat.add(y, 1)],
      [compat.add(x, shift), compat.add(y, 1)],
    ])) {
      {
        const __v9 = compat.iter(__v8);
        raw_x = __v9[0];
        ny = __v9[1];
      }
      if (
        compat.truth(
          compat.or(
            () =>
              !compat.truth(
                compat.compare(0, ny) <= 0 && compat.compare(ny, height) < 0,
              ),
            () =>
              compat.and(
                () => !compat.truth(wrap),
                () =>
                  !compat.truth(
                    compat.compare(0, raw_x) <= 0 &&
                      compat.compare(raw_x, width) < 0,
                  ),
              ),
          ),
        )
      ) {
        continue;
      }
      nx = compat.truth(wrap) ? compat.mod(raw_x, width) : raw_x;
      other = compat.get(tiles, [nx, ny], null);
      if (
        compat.truth(
          compat.or(
            () => other === null,
            () =>
              compat.or(
                () => compat.eq([nx, ny], [x, y]),
                () => !compat.truth(has_route(other)),
              ),
          ),
        )
      ) {
        continue;
      }
      key = compat.tuple(
        compat.sorted([
          [x, y],
          [nx, ny],
        ]),
      );
      if (compat.truth(compat.has(seen, key))) {
        continue;
      }
      compat.add(seen, key);
      types = [
        compat.get(tile, "route", null),
        compat.get(other, "route", null),
      ];
      kind = compat.truth(
        compat.all(
          (() => {
            const __v10: any[] = [];
            for (const __v11 of compat.iter(types)) {
              let t: any = __v11;
              __v10.push(compat.eq(t, "ROUTE_RAILROAD"));
            }
            return __v10;
          })(),
        ),
      )
        ? "railroad"
        : compat.truth(
              compat.all(
                (() => {
                  const __v12: any[] = [];
                  for (const __v13 of compat.iter(types)) {
                    let t: any = __v13;
                    __v12.push(compat.has(["ROUTE_ROAD", "ROUTE_RAILROAD"], t));
                  }
                  return __v12;
                })(),
              ),
            )
          ? "road"
          : "route";
      pillaged = compat.or(
        () => compat.get(tile, "routePillaged", null) === true,
        () => compat.get(other, "routePillaged", null) === true,
      );
      a = [compat.add(compat.mul(2, x), compat.bitAnd(y, 1)), compat.mul(3, y)];
      b = [
        compat.add(compat.mul(2, raw_x), compat.bitAnd(ny, 1)),
        compat.mul(3, ny),
      ];
      info = compat.dict([
        ["kind", kind],
        ["pillaged", pillaged],
        ["tiles", key],
      ]);
      if (compat.truth(!compat.eq(nx, raw_x))) {
        mid = [
          compat.div(compat.add(compat.get(a, 0), compat.get(b, 0)), 2),
          compat.div(compat.add(compat.get(a, 1), compat.get(b, 1)), 2),
        ];
        displacement = compat.mul(2, compat.sub(nx, raw_x));
        canonical_b = [
          compat.add(compat.get(b, 0), displacement),
          compat.get(b, 1),
        ];
        canonical_mid = [
          compat.add(compat.get(mid, 0), displacement),
          compat.get(mid, 1),
        ];
        compat.extend(result, [
          compat.dict(
            info,
            compat.dict([
              ["start", a],
              ["end", mid],
            ]),
          ),
          compat.dict(
            info,
            compat.dict([
              ["start", canonical_b],
              ["end", canonical_mid],
            ]),
          ),
        ]);
      } else {
        compat.append(
          result,
          compat.dict(
            info,
            compat.dict([
              ["start", a],
              ["end", b],
            ]),
          ),
        );
      }
    }
  }
  return result;
}
