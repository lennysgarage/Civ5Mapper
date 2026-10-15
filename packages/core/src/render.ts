// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { THEMES, presentationColor } from "./presentation.js";
import {
  validateReligion,
  religionAvailability,
  religionTerritories,
  religionMarker,
  layoutReligionLegend,
} from "./religion.js";
import { route_segments } from "./routes.js";
import { naturalWonderLabelTiles } from "./natural_wonders.js";
import {
  ROLE_LABELS,
  detailed_symbol,
  military_role,
  military_summary,
} from "./military.js";
export let DEFAULT_STYLE: any, PALETTE: any, TERRAIN_COLORS: any, VERTICES: any;
/** Deterministic SVG renderer for complete normalized JSON; no binary imports. */

DEFAULT_STYLE = compat.dict([
  ["theme", "atlas"],
  ["oceanColor", "#244b60"],
  ["ownedWaterColor", "#80b3bd"],
  ["unownedColor", "#eee7d5"],
  ["showUnownedPattern", true],
  ["borderColor", "#292a28"],
  ["borderWidth", 1.4],
  ["showCities", true],
  ["showMountains", true],
  ["showCivilizationNames", true],
  ["showForests", true],
  ["showNaturalWonders", true],
  ["countryFontSize", 18],
  ["cityFontSize", 10],
  ["colorOverrides", compat.dict([])],
  ["empireLabels", "player"],
  ["shadeAlliedCityStates", true],
  ["allyShade", 0.35],
  ["showOwnedWater", true],
  ["showHexGrid", true],
  ["mountainSize", 16],
  ["showCapitals", true],
  ["capitalSize", 12],
  ["showRoads", true],
  ["cityStateLabelColor", "#5b4775"],
  ["showRivers", true],
  ["riverColor", "#397c9b"],
  ["riverWidth", 2],
  ["roadColor", "#665548"],
  ["roadWidth", 2],
  ["railroadColor", "#343e44"],
  ["terrainColors", compat.dict([])],
  ["unknownTerrainColor", "#b5b1a3"],
  ["armyMarkerSize", 10],
  ["armyIcons", "domain"],
  ["showMilitarySummary", false],
]);
TERRAIN_COLORS = compat.dict([
  ["TERRAIN_GRASS", "#92b979"],
  ["TERRAIN_PLAINS", "#c7be80"],
  ["TERRAIN_DESERT", "#e4c58c"],
  ["TERRAIN_TUNDRA", "#a9ac99"],
  ["TERRAIN_SNOW", "#f2f0e8"],
  ["TERRAIN_COAST", "#699d9f"],
  ["TERRAIN_OCEAN", "#315465"],
  ["TERRAIN_MOUNTAIN", "#959992"],
  ["TERRAIN_HILL", "#b8ac87"],
]);
PALETTE = ["#d99572", "#9ab77a", "#c5a6c7", "#dec479", "#86b6ba", "#8d9fc3"];
VERTICES = [
  [0, 2],
  [1, 1],
  [1, -1],
  [0, -2],
  [-1, -1],
  [-1, 1],
];
export function validate_world(world: any): any {
  let ally: any,
    by_id: any,
    by_pos: any,
    capitals: any,
    city: any,
    civ: any,
    civs: any,
    expected: any,
    game: any,
    height: any,
    ids: any,
    matches: any,
    owner: any,
    tile: any,
    width: any,
    x: any,
    y: any;
  if (
    compat.truth(!compat.eq(compat.get(world, "schemaVersion", null), "0.1"))
  ) {
    throw new compat.ParseError("unsupported schemaVersion");
  }
  if (
    compat.truth(
      !compat.eq(
        compat.get(
          compat.get(world, "extraction", compat.dict([])),
          "status",
          null,
        ),
        "complete",
      ),
    )
  ) {
    throw new compat.ParseError(
      "render requires complete map data; partial inspection JSON cannot be rendered",
    );
  }
  game = compat.get(world, "game");
  {
    const __v1 = compat.iter([
      compat.get(game, "width"),
      compat.get(game, "height"),
    ]);
    width = __v1[0];
    height = __v1[1];
  }
  if (
    compat.truth(
      compat.or(
        () =>
          compat.any(
            (() => {
              const __v2: any[] = [];
              for (const __v3 of compat.iter([width, height])) {
                let n: any = __v3;
                __v2.push(
                  compat.or(
                    () => compat.type(n) !== compat.int,
                    () =>
                      !compat.truth(
                        compat.compare(1, n) <= 0 &&
                          compat.compare(n, 1024) <= 0,
                      ),
                  ),
                );
              }
              return __v2;
            })(),
          ),
        () => compat.compare(compat.mul(width, height), 500000) > 0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid grid dimensions");
  }
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(compat.get(game, "coordinates"), "odd-r-bottom-up"),
        () =>
          compat.or(
            () => compat.type(compat.get(game, "wrapX")) !== compat.bool,
            () => compat.type(compat.get(game, "wrapY")) !== compat.bool,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid coordinate or wrapping declaration");
  }
  if (compat.truth(compat.get(game, "wrapY"))) {
    throw new compat.ParseError(
      "vertical wrapping is not supported by the prototype renderer",
    );
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.isinstance(compat.get(world, "tiles"), compat.list),
          ),
        () =>
          !compat.eq(
            compat.len(compat.get(world, "tiles")),
            compat.mul(width, height),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "complete maps require one tile at every coordinate",
    );
  }
  civs = compat.get(world, "civilizations");
  ids = (() => {
    const __v4: any[] = [];
    for (const __v5 of compat.iter(civs)) {
      let c: any = __v5;
      __v4.push(compat.get(c, "id"));
    }
    return __v4;
  })();
  if (
    compat.truth(
      compat.or(
        () =>
          compat.any(
            (() => {
              const __v6: any[] = [];
              for (const __v7 of compat.iter(ids)) {
                let n: any = __v7;
                __v6.push(
                  compat.or(
                    () => compat.type(n) !== compat.int,
                    () => compat.compare(n, 0) < 0,
                  ),
                );
              }
              return __v6;
            })(),
          ),
        () => !compat.eq(compat.len(ids), compat.len(compat.set(ids))),
      ),
    )
  ) {
    throw new compat.ParseError("invalid or duplicate civilization ID");
  }
  by_id = (() => {
    const __v8: any[] = [];
    for (const __v9 of compat.iter(civs)) {
      let c: any = __v9;
      __v8.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v8);
  })();
  for (const __v10 of compat.iter(civs)) {
    civ = __v10;
    if (
      compat.truth(
        compat.and(
          () => compat.get(civ, "playerName", null) !== null,
          () =>
            !compat.truth(
              compat.isinstance(compat.get(civ, "playerName"), compat.str),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid player display name");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.has(civ, "allianceKnown"),
          () => compat.type(compat.get(civ, "allianceKnown")) !== compat.bool,
        ),
      )
    ) {
      throw new compat.ParseError("allianceKnown must be boolean");
    }
    ally = compat.get(civ, "ally", null);
    if (
      compat.truth(
        compat.and(
          () => ally !== null,
          () =>
            compat.or(
              () => compat.type(ally) !== compat.int,
              () =>
                compat.or(
                  () => !compat.has(by_id, ally),
                  () =>
                    compat.or(
                      () =>
                        !compat.eq(
                          compat.get(compat.get(by_id, ally), "kind"),
                          "major",
                        ),
                      () => !compat.eq(compat.get(civ, "kind"), "city-state"),
                    ),
                ),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid city-state ally reference");
    }
  }
  by_pos = compat.dict([]);
  for (const __v11 of compat.iter(compat.get(world, "tiles"))) {
    tile = __v11;
    {
      const __v12 = compat.iter([compat.get(tile, "x"), compat.get(tile, "y")]);
      x = __v12[0];
      y = __v12[1];
    }
    if (
      compat.truth(
        compat.or(
          () => compat.type(x) !== compat.int,
          () =>
            compat.or(
              () => compat.type(y) !== compat.int,
              () =>
                !compat.truth(
                  compat.and(
                    () =>
                      compat.compare(0, x) <= 0 && compat.compare(x, width) < 0,
                    () =>
                      compat.compare(0, y) <= 0 &&
                      compat.compare(y, height) < 0,
                  ),
                ),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("tile outside grid");
    }
    if (compat.truth(compat.has(by_pos, [x, y]))) {
      throw new compat.ParseError("duplicate tile coordinate");
    }
    if (
      compat.truth(
        !compat.has(["land", "water"], compat.get(tile, "landWater")),
      )
    ) {
      throw new compat.ParseError(
        "renderer requires known land/water classification",
      );
    }
    if (compat.truth(compat.get(tile, "ownershipKnown", null) !== true)) {
      throw new compat.ParseError(
        "renderer requires known ownership, including explicit unowned tiles",
      );
    }
    if (
      compat.truth(
        compat.and(
          () => compat.get(tile, "riverEdges", null) !== null,
          () =>
            compat.or(
              () =>
                !compat.truth(
                  compat.isinstance(
                    compat.get(tile, "riverEdges"),
                    compat.list,
                  ),
                ),
              () =>
                compat.or(
                  () =>
                    compat.any(
                      (() => {
                        const __v13: any[] = [];
                        for (const __v14 of compat.iter(
                          compat.get(tile, "riverEdges"),
                        )) {
                          let e: any = __v14;
                          __v13.push(!compat.has(["E", "SE", "SW"], e));
                        }
                        return __v13;
                      })(),
                    ),
                  () =>
                    !compat.eq(
                      compat.len(compat.set(compat.get(tile, "riverEdges"))),
                      compat.len(compat.get(tile, "riverEdges")),
                    ),
                ),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid river edges");
    }
    owner = compat.get(tile, "owner", null);
    if (
      compat.truth(
        compat.and(
          () => owner !== null,
          () =>
            compat.or(
              () => compat.type(owner) !== compat.int,
              () => !compat.has(ids, owner),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("tile references unknown owner");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.has(tile, "routeKnown"),
          () => compat.type(compat.get(tile, "routeKnown")) !== compat.bool,
        ),
      )
    ) {
      throw new compat.ParseError("routeKnown must be boolean");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.get(tile, "routeId", null) !== null,
          () =>
            compat.or(
              () => compat.type(compat.get(tile, "routeId")) !== compat.int,
              () => compat.compare(compat.get(tile, "routeId"), 0) < 0,
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid route ID");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.get(tile, "route", null) !== null,
          () =>
            !compat.truth(
              compat.isinstance(compat.get(tile, "route"), compat.str),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid route type");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.has(tile, "routePillaged"),
          () => compat.type(compat.get(tile, "routePillaged")) !== compat.bool,
        ),
      )
    ) {
      throw new compat.ParseError("routePillaged must be boolean");
    }
    if (
      compat.truth(
        compat.and(
          () => compat.get(tile, "routeKnown", null),
          () =>
            compat.and(
              () =>
                compat.or(
                  () => compat.get(tile, "routeId", null) !== null,
                  () => compat.get(tile, "route", null) !== null,
                ),
              () => !compat.eq(compat.get(tile, "landWater"), "land"),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("physical routes must be on land");
    }
    compat.put(by_pos, [x, y], tile);
  }
  if (
    compat.truth(
      !compat.truth(
        compat.isinstance(compat.get(world, "cities"), compat.list),
      ),
    )
  ) {
    throw new compat.ParseError(
      "cities must be an array; null means unavailable",
    );
  }
  for (const __v15 of compat.iter(compat.get(world, "cities"))) {
    city = __v15;
    {
      const __v16 = compat.iter([compat.get(city, "x"), compat.get(city, "y")]);
      x = __v16[0];
      y = __v16[1];
    }
    if (
      compat.truth(
        compat.or(
          () => compat.type(x) !== compat.int,
          () =>
            compat.or(
              () => compat.type(y) !== compat.int,
              () => !compat.has(by_pos, [x, y]),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("city outside grid");
    }
    if (
      compat.truth(
        compat.or(
          () => !compat.has(ids, compat.get(city, "owner")),
          () => compat.type(compat.get(city, "owner")) !== compat.int,
        ),
      )
    ) {
      throw new compat.ParseError("city references unknown owner");
    }
    if (
      compat.truth(
        compat.or(
          () =>
            !compat.eq(
              compat.get(compat.get(by_pos, [x, y]), "landWater"),
              "land",
            ),
          () =>
            !compat.eq(
              compat.get(compat.get(by_pos, [x, y]), "owner"),
              compat.get(city, "owner"),
            ),
        ),
      )
    ) {
      throw new compat.ParseError(
        "city conflicts with tile geography or owner",
      );
    }
    if (
      compat.truth(
        compat.or(
          () =>
            !compat.truth(
              compat.isinstance(compat.get(city, "name"), compat.str),
            ),
          () =>
            compat.and(
              () => compat.get(city, "capital", null) !== null,
              () => compat.type(compat.get(city, "capital")) !== compat.bool,
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid city name or capital");
    }
  }
  capitals = (() => {
    const __v17: any[] = [];
    for (const __v18 of compat.iter(compat.get(world, "cities"))) {
      let c: any = __v18;
      if (!compat.truth(compat.get(c, "capital", null) === true)) continue;
      __v17.push(c);
    }
    return __v17;
  })();
  if (
    compat.truth(
      !compat.eq(
        compat.len(
          (() => {
            const __v19: any[] = [];
            for (const __v20 of compat.iter(capitals)) {
              let c: any = __v20;
              __v19.push(compat.get(c, "owner"));
            }
            return compat.set(__v19);
          })(),
        ),
        compat.len(capitals),
      ),
    )
  ) {
    throw new compat.ParseError("multiple current capitals for one owner");
  }
  for (const __v21 of compat.iter(civs)) {
    civ = __v21;
    if (compat.truth(compat.get(civ, "capitalKnown", null) === true)) {
      matches = (() => {
        const __v22: any[] = [];
        for (const __v23 of compat.iter(capitals)) {
          let c: any = __v23;
          if (
            !compat.truth(
              compat.eq(compat.get(c, "owner"), compat.get(civ, "id")),
            )
          )
            continue;
          __v22.push(c);
        }
        return __v22;
      })();
      expected = compat.get(civ, "capitalCityId", null);
      if (
        compat.truth(
          compat.or(
            () =>
              compat.and(
                () => expected === null,
                () => matches,
              ),
            () =>
              compat.and(
                () => expected !== null,
                () =>
                  compat.or(
                    () => !compat.eq(compat.len(matches), 1),
                    () =>
                      !compat.eq(
                        compat.get(compat.get(matches, 0), "id", null),
                        expected,
                      ),
                  ),
              ),
          ),
        )
      ) {
        throw new compat.ParseError(
          "capital city reference conflicts with city flags",
        );
      }
    }
  }
  return by_pos;
}
export function lattice(tile: any): any {
  let x: any, y: any;
  {
    const __v24 = compat.iter([
      compat.add(
        compat.mul(2, compat.get(tile, "x")),
        compat.bitAnd(compat.get(tile, "y"), 1),
      ),
      compat.mul(3, compat.get(tile, "y")),
    ]);
    x = __v24[0];
    y = __v24[1];
  }
  return (() => {
    const __v25: any[] = [];
    for (const __v26 of compat.iter(VERTICES)) {
      let [dx, dy] = compat.iter(__v26);
      __v25.push([compat.add(x, dx), compat.add(y, dy)]);
    }
    return __v25;
  })();
}
export function boundary_edges(world: any): any {
  let _: any,
    a: any,
    b: any,
    edges: any,
    entries: any,
    first: any,
    geometry: any,
    key_points: any,
    kind: any,
    other: any,
    points: any,
    result: any,
    seen: any,
    tile: any,
    width: any,
    wrap: any;
  /** Exact shared-edge cancellation, including paired horizontal seam edges. */
  edges = compat.defaultdict(compat.list);
  width = compat.get(compat.get(world, "game"), "width");
  wrap = compat.get(compat.get(world, "game"), "wrapX");
  for (const __v27 of compat.iter(
    compat.sorted(
      compat.get(world, "tiles"),
      compat.dict([
        ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
      ]),
    ),
  )) {
    tile = __v27;
    points = lattice(tile);
    for (const __v28 of compat.iter(
      compat.zip(
        points,
        compat.add(
          compat.slice(points, 1, null, null),
          compat.slice(points, null, 1, null),
        ),
      ),
    )) {
      {
        const __v29 = compat.iter(__v28);
        a = __v29[0];
        b = __v29[1];
      }
      key_points = compat.truth(wrap)
        ? [
            [
              compat.mod(compat.get(a, 0), compat.mul(2, width)),
              compat.get(a, 1),
            ],
            [
              compat.mod(compat.get(b, 0), compat.mul(2, width)),
              compat.get(b, 1),
            ],
          ]
        : [a, b];
      compat.append(
        compat.get(edges, compat.tuple(compat.sorted(key_points))),
        [tile, a, b],
      );
    }
  }
  result = [];
  for (const __v30 of compat.iter(compat.values(edges))) {
    entries = __v30;
    first = compat.get(compat.get(entries, 0), 0);
    if (compat.truth(compat.eq(compat.len(entries), 1))) {
      kind = compat.truth(compat.eq(compat.get(first, "landWater"), "land"))
        ? "coast"
        : null;
    } else {
      other = compat.get(compat.get(entries, 1), 0);
      kind = compat.truth(
        !compat.eq(
          compat.get(first, "landWater"),
          compat.get(other, "landWater"),
        ),
      )
        ? "coast"
        : compat.truth(
              !compat.eq(
                compat.get(first, "owner"),
                compat.get(other, "owner"),
              ),
            )
          ? "border"
          : null;
    }
    if (compat.truth(kind)) {
      seen = compat.set();
      for (const __v31 of compat.iter(entries)) {
        {
          const __v32 = compat.iter(__v31);
          _ = __v32[0];
          a = __v32[1];
          b = __v32[2];
        }
        geometry = compat.tuple(compat.sorted([a, b]));
        if (compat.truth(!compat.has(seen, geometry))) {
          compat.append(result, [kind, a, b]);
          compat.add(seen, geometry);
        }
      }
    }
  }
  return result;
}
export function polygon_rings(tiles: any): any {
  let a: any,
    b: any,
    current: any,
    edges: any,
    following: any,
    key: any,
    points: any,
    ring: any,
    rings: any,
    start: any,
    tile: any;
  /** Trace exact local edge unions; preserve islands and holes at the SVG cut. */
  edges = compat.dict([]);
  for (const __v33 of compat.iter(
    compat.sorted(
      tiles,
      compat.dict([
        ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
      ]),
    ),
  )) {
    tile = __v33;
    points = lattice(tile);
    for (const __v34 of compat.iter(
      compat.zip(
        points,
        compat.add(
          compat.slice(points, 1, null, null),
          compat.slice(points, null, 1, null),
        ),
      ),
    )) {
      {
        const __v35 = compat.iter(__v34);
        a = __v35[0];
        b = __v35[1];
      }
      key = compat.tuple(compat.sorted([a, b]));
      if (compat.truth(compat.has(edges, key))) {
        compat.del(edges, key);
      } else {
        compat.put(edges, key, [a, b]);
      }
    }
  }
  following = compat.dict([]);
  for (const __v36 of compat.iter(compat.values(edges))) {
    {
      const __v37 = compat.iter(__v36);
      a = __v37[0];
      b = __v37[1];
    }
    if (compat.truth(compat.has(following, a))) {
      throw new compat.ParseError("ambiguous polygon vertex");
    }
    compat.put(following, a, b);
  }
  rings = [];
  while (compat.truth(following)) {
    start = compat.min(following);
    {
      const __v38 = compat.iter([start, [start]]);
      current = __v38[0];
      ring = __v38[1];
    }
    while (compat.truth(true)) {
      if (compat.truth(!compat.has(following, current))) {
        throw new compat.ParseError("open polygon boundary");
      }
      current = compat.pop(following, current);
      if (compat.truth(compat.eq(current, start))) {
        break;
      }
      compat.append(ring, current);
    }
    compat.append(rings, ring);
  }
  return rings;
}
export function largest_component(tiles: any, width: any, wrap: any): any {
  let component: any,
    components: any,
    nx: any,
    ny: any,
    p: any,
    pending: any,
    remaining: any,
    shift: any,
    start: any,
    tile: any,
    x: any,
    y: any;
  remaining = (() => {
    const __v39: any[] = [];
    for (const __v40 of compat.iter(tiles)) {
      let t: any = __v40;
      __v39.push([[compat.get(t, "x"), compat.get(t, "y")], t]);
    }
    return compat.dict(__v39);
  })();
  components = [];
  while (compat.truth(remaining)) {
    start = compat.min(remaining);
    {
      const __v41 = compat.iter([[start], []]);
      pending = __v41[0];
      component = __v41[1];
    }
    while (compat.truth(pending)) {
      p = compat.pop(pending);
      if (compat.truth(!compat.has(remaining, p))) {
        continue;
      }
      tile = compat.pop(remaining, p);
      compat.append(component, tile);
      {
        const __v42 = compat.iter(p);
        x = __v42[0];
        y = __v42[1];
      }
      shift = compat.bitAnd(y, 1);
      for (const __v43 of compat.iter([
        [compat.sub(x, 1), y],
        [compat.add(x, 1), y],
        [compat.add(compat.sub(x, 1), shift), compat.sub(y, 1)],
        [compat.add(x, shift), compat.sub(y, 1)],
        [compat.add(compat.sub(x, 1), shift), compat.add(y, 1)],
        [compat.add(x, shift), compat.add(y, 1)],
      ])) {
        {
          const __v44 = compat.iter(__v43);
          nx = __v44[0];
          ny = __v44[1];
        }
        if (compat.truth(wrap)) {
          nx = compat.mod(nx, width);
        }
        if (compat.truth(compat.has(remaining, [nx, ny]))) {
          compat.append(pending, [nx, ny]);
        }
      }
    }
    compat.append(components, component);
  }
  return compat.max(components, compat.dict([["key", compat.len]]));
}
export function empire_label(civ: any, mode: any = "player"): any {
  /** One label policy for map text and factual replay captions. */
  if (
    compat.truth(
      compat.and(
        () => compat.eq(mode, "player"),
        () =>
          compat.and(
            () => compat.eq(compat.get(civ, "kind", null), "major"),
            () => compat.get(civ, "playerName", null),
          ),
      ),
    )
  ) {
    return compat.get(civ, "playerName");
  }
  return compat.or(
    () => compat.get(civ, "name", null),
    () =>
      compat.or(
        () => compat.get(civ, "key", null),
        () => compat.str(compat.get(civ, "id")),
      ),
  );
}
export function caption_footer(
  lines: any,
  width: any,
  top: any,
  config: any,
  turn: any,
): any {
  let available: any, capacity: any, index: any, left: any, out: any, text: any;
  /** Fixed-height SVG footer; full messages remain in accessible tooltips. */
  left = compat.min(40, compat.div(width, 10));
  available = compat.sub(width, compat.mul(2, left));
  capacity = compat.max(
    1,
    compat.int(compat.div(available, compat.mul(16, 0.65))),
  );
  out = [
    '<g class="replay-captions" transform="translate(0,' +
      compat.format(top, ".2f") +
      ')">',
    "<title>" +
      compat.format(compat.escape(compat.join(compat.chr(10), lines)), "") +
      "</title>",
    '<rect width="' +
      compat.format(width, ".2f") +
      '" height="120" fill="' +
      compat.format(compat.get(config, "unownedColor"), "") +
      '"/>',
    '<path d="M0,0 H' +
      compat.format(width, ".2f") +
      '" stroke="' +
      compat.format(compat.get(config, "borderColor"), "") +
      '" stroke-width="' +
      compat.format(compat.get(config, "borderWidth"), "") +
      '"/>',
    '<defs><clipPath id="caption-clip"><rect x="' +
      compat.format(left, ".2f") +
      '" y="4" width="' +
      compat.format(available, ".2f") +
      '" height="112"/></clipPath></defs>',
    '<g clip-path="url(#caption-clip)" style="fill:' +
      compat.format(compat.get(config, "borderColor"), "") +
      ';stroke:none">',
  ];
  function row(text: any, y: any, css: any, bold: any = false): any {
    let display: any, weight: any;
    display = compat.join(" ", compat.split(text));
    if (compat.truth(compat.compare(compat.len(display), capacity) > 0)) {
      display = compat.add(
        compat.slice(
          display,
          null,
          compat.max(0, compat.sub(capacity, 1)),
          null,
        ),
        "\u2026",
      );
    }
    weight = compat.truth(bold) ? ' font-weight="bold"' : "";
    return (
      '<text class="' +
      compat.format(css, "") +
      '" x="' +
      compat.format(left, ".2f") +
      '" y="' +
      compat.format(y, "") +
      '" font-size="16" style="fill:' +
      compat.format(compat.get(config, "borderColor"), "") +
      ';stroke:none"' +
      compat.format(weight, "") +
      "><title>" +
      compat.format(compat.escape(text), "") +
      "</title>" +
      compat.format(compat.escape(display), "") +
      "</text>"
    );
  }
  compat.append(
    out,
    row(
      "Turn " + compat.format(turn, "") + " \u2014 Major events",
      24,
      "caption-heading",
      true,
    ),
  );
  for (const __v45 of compat.iter(
    compat.enumerate(
      compat.or(
        () => compat.slice(lines, null, 3, null),
        () => ["No major events recorded this turn."],
      ),
    ),
  )) {
    {
      const __v46 = compat.iter(__v45);
      index = __v46[0];
      text = __v46[1];
    }
    compat.append(
      out,
      row(
        text,
        compat.add(46, compat.mul(index, 20)),
        compat.truth(lines) ? "caption-event" : "caption-empty",
      ),
    );
  }
  if (compat.truth(compat.compare(compat.len(lines), 3) > 0)) {
    compat.append(
      out,
      row(
        "+" +
          compat.format(compat.sub(compat.len(lines), 3), "") +
          " more major events",
        106,
        "caption-overflow",
      ),
    );
  }
  compat.extend(out, ["</g>", "</g>"]);
  return out;
}
export function army_groups(world: any): any {
  let civs: any,
    groups: any,
    owner: any,
    seen: any,
    unit: any,
    units: any,
    x: any,
    y: any;
  /** Known combat units only; ownership is independent of territorial owner. */
  units = compat.get(world, "units", null);
  if (
    compat.truth(
      compat.or(
        () => !compat.truth(compat.isinstance(units, compat.list)),
        () =>
          !compat.eq(
            compat.get(
              compat.get(
                compat.get(world, "extraction", compat.dict([])),
                "fields",
                compat.dict([]),
              ),
              "unitPositions",
              null,
            ),
            "extracted",
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "army mode requires extracted unit positions; extract with --units or use render-save --mode army",
    );
  }
  civs = (() => {
    const __v47: any[] = [];
    for (const __v48 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v48;
      __v47.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v47);
  })();
  {
    const __v49 = compat.iter([compat.set(), compat.defaultdict(compat.list)]);
    seen = __v49[0];
    groups = __v49[1];
  }
  for (const __v50 of compat.iter(units)) {
    unit = __v50;
    {
      const __v51 = compat.iter([
        compat.get(unit, "owner"),
        compat.get(unit, "x"),
        compat.get(unit, "y"),
      ]);
      owner = __v51[0];
      x = __v51[1];
      y = __v51[2];
    }
    if (
      compat.truth(
        compat.or(
          () => compat.type(owner) !== compat.int,
          () =>
            compat.or(
              () => !compat.has(civs, owner),
              () =>
                compat.or(
                  () =>
                    compat.any(
                      (() => {
                        const __v52: any[] = [];
                        for (const __v53 of compat.iter([x, y])) {
                          let v: any = __v53;
                          __v52.push(compat.type(v) !== compat.int);
                        }
                        return __v52;
                      })(),
                    ),
                  () =>
                    compat.or(
                      () =>
                        !compat.truth(
                          compat.compare(0, x) <= 0 &&
                            compat.compare(
                              x,
                              compat.get(compat.get(world, "game"), "width"),
                            ) < 0,
                        ),
                      () =>
                        !compat.truth(
                          compat.compare(0, y) <= 0 &&
                            compat.compare(
                              y,
                              compat.get(compat.get(world, "game"), "height"),
                            ) < 0,
                        ),
                    ),
                ),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid unit owner or coordinate");
    }
    if (
      compat.truth(
        compat.or(
          () =>
            !compat.truth(
              compat.isinstance(compat.get(unit, "id"), compat.str),
            ),
          () => compat.has(seen, compat.get(unit, "id")),
        ),
      )
    ) {
      throw new compat.ParseError("invalid or duplicate unit identity");
    }
    compat.add(seen, compat.get(unit, "id"));
    if (
      compat.truth(
        !compat.eq(compat.get(compat.get(civs, owner), "kind"), "major"),
      )
    ) {
      continue;
    }
    if (
      compat.truth(
        compat.or(
          () => compat.get(unit, "classificationKnown", null) !== true,
          () =>
            compat.type(compat.get(unit, "isMilitary", null)) !== compat.bool,
        ),
      )
    ) {
      throw new compat.ParseError(
        "army mode requires known military classification; supply the matching --ruleset when extracting the save",
      );
    }
    if (compat.truth(!compat.truth(compat.get(unit, "isMilitary")))) {
      continue;
    }
    if (
      compat.truth(
        compat.or(
          () =>
            !compat.truth(
              compat.isinstance(compat.get(unit, "type", null), compat.str),
            ),
          () =>
            !compat.truth(
              compat.isinstance(compat.get(unit, "domain", null), compat.str),
            ),
        ),
      )
    ) {
      throw new compat.ParseError(
        "military units require resolved type and domain",
      );
    }
    compat.append(compat.get(groups, [owner, x, y]), unit);
  }
  return compat.dict(compat.sorted(compat.items(groups)));
}
export function army_symbol(domain: any): any {
  /** Domain symbols; unfamiliar/modded domains retain a generic shield. */
  if (compat.truth(compat.eq(domain, "DOMAIN_LAND"))) {
    return [
      "land",
      '<path d="M-5,5 L4,-4 L5,-7 L2,-6 L-7,3 M-5,1 L-1,5 M5,5 L-4,-4 L-5,-7 L-2,-6 L7,3 M1,5 L5,1"/>',
    ];
  }
  if (compat.truth(compat.eq(domain, "DOMAIN_SEA"))) {
    return [
      "naval",
      '<path d="M-7,2 H7 L4,6 H-4 Z M0,2 V-7 M1,-6 L6,0 H1 Z M-1,-5 L-5,0 H-1 Z M-7,8 Q-4,6 -1,8 Q2,10 5,8"/>',
    ];
  }
  if (compat.truth(compat.eq(domain, "DOMAIN_AIR"))) {
    return [
      "air",
      '<path d="M0,-8 L2,-2 L7,2 V4 L2,2 L1,6 L3,8 H-3 L-1,6 L-2,2 L-7,4 V2 L-2,-2 Z"/>',
    ];
  }
  return [
    "generic",
    '<path d="M-6,-6 H6 V1 Q5,5 0,8 Q-5,5 -6,1 Z M0,-3 V3 M-3,0 H3"/>',
  ];
}
export function military_summary_panel(
  entries: any,
  civs: any,
  colors: any,
  label: any,
  width: any,
  start_y: any,
): any {
  let card_width: any,
    cards: any,
    column: any,
    columns: any,
    count: any,
    entry: any,
    height: any,
    line: any,
    name_lines: any,
    names: any,
    owner: any,
    role: any,
    row: any,
    row_height: any,
    row_start: any,
    symbol: any,
    ty: any,
    x: any,
    y: any;
  /** Append cards below the unchanged map; size them to their actual content. */
  columns = compat.max(
    1,
    compat.int(compat.floorDiv(compat.sub(width, 80), 340)),
  );
  card_width = compat.div(
    compat.sub(compat.sub(width, 80), compat.mul(compat.sub(columns, 1), 16)),
    columns,
  );
  y = compat.add(start_y, 80);
  cards = [];
  for (const __v54 of compat.iter(
    compat.range(0, compat.len(entries), columns),
  )) {
    row_start = __v54;
    row = compat.slice(
      entries,
      row_start,
      compat.add(row_start, columns),
      null,
    );
    names = (() => {
      const __v55: any[] = [];
      for (const __v56 of compat.iter(row)) {
        let e: any = __v56;
        __v55.push(
          compat.or(
            () =>
              compat.wrap(
                label(compat.get(civs, compat.get(e, "owner"))),
                compat.max(
                  8,
                  compat.int(compat.div(compat.sub(card_width, 40), 8)),
                ),
              ),
            () => ["Unnamed empire"],
          ),
        );
      }
      return __v55;
    })();
    row_height = compat.max(
      (() => {
        const __v57: any[] = [];
        for (const __v58 of compat.iter(compat.zip(names, row))) {
          let [name, e] = compat.iter(__v58);
          __v57.push(
            compat.add(
              compat.add(64, compat.mul(compat.len(name), 18)),
              compat.mul(
                compat.max(1, compat.len(compat.get(e, "categories"))),
                20,
              ),
            ),
          );
        }
        return __v57;
      })(),
    );
    for (const __v59 of compat.iter(compat.enumerate(compat.zip(row, names)))) {
      {
        const __v60 = compat.iter(__v59);
        column = __v60[0];
        {
          const __v61 = compat.iter(__v60[1]);
          entry = __v61[0];
          name_lines = __v61[1];
        }
      }
      owner = compat.get(entry, "owner");
      x = compat.add(40, compat.mul(column, compat.add(card_width, 16)));
      compat.append(
        cards,
        '<g class="military-summary-empire" data-owner="' +
          compat.format(owner, "") +
          '" data-total="' +
          compat.format(compat.get(entry, "total"), "") +
          '"><rect x="' +
          compat.format(x, ".2f") +
          '" y="' +
          compat.format(y, ".2f") +
          '" width="' +
          compat.format(card_width, ".2f") +
          '" height="' +
          compat.format(row_height, ".2f") +
          '" rx="6" fill="#fff8e8" stroke="' +
          compat.format(compat.get(colors, owner), "") +
          '" stroke-width="2"/>',
      );
      ty = compat.add(y, 25);
      for (const __v62 of compat.iter(name_lines)) {
        line = __v62;
        compat.append(
          cards,
          '<text x="' +
            compat.format(compat.add(x, 16), ".2f") +
            '" y="' +
            compat.format(ty, ".2f") +
            '" font-size="14" font-weight="bold">' +
            compat.format(compat.escape(line), "") +
            "</text>",
        );
        ty = compat.add(ty, 18);
      }
      compat.append(
        cards,
        '<text class="military-total" x="' +
          compat.format(compat.add(x, 16), ".2f") +
          '" y="' +
          compat.format(compat.add(ty, 4), ".2f") +
          '" font-size="12">Military units: ' +
          compat.format(compat.get(entry, "total"), "") +
          "</text>",
      );
      ty = compat.add(ty, 30);
      if (compat.truth(!compat.truth(compat.get(entry, "categories")))) {
        compat.append(
          cards,
          '<text x="' +
            compat.format(compat.add(x, 16), ".2f") +
            '" y="' +
            compat.format(ty, ".2f") +
            '" font-size="11">No military units on plots</text>',
        );
      }
      for (const __v63 of compat.iter(
        compat.items(compat.get(entry, "categories")),
      )) {
        {
          const __v64 = compat.iter(__v63);
          role = __v64[0];
          count = __v64[1];
        }
        symbol = compat.or(
          () => detailed_symbol(role),
          () =>
            compat.get(
              army_symbol(
                compat.get(
                  compat.dict([
                    ["land", "DOMAIN_LAND"],
                    ["naval", "DOMAIN_SEA"],
                    ["air", "DOMAIN_AIR"],
                  ]),
                  role,
                  null,
                ),
              ),
              1,
            ),
        );
        compat.append(
          cards,
          '<g class="military-summary-category" data-category="' +
            compat.format(role, "") +
            '" data-count="' +
            compat.format(count, "") +
            '"><g transform="translate(' +
            compat.format(compat.add(x, 24), ".2f") +
            " " +
            compat.format(compat.sub(ty, 4), ".2f") +
            ') scale(0.8)" fill="none" stroke="#242a30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            compat.format(symbol, "") +
            '</g><text x="' +
            compat.format(compat.add(x, 42), ".2f") +
            '" y="' +
            compat.format(ty, ".2f") +
            '" font-size="11">' +
            compat.format(compat.escape(compat.get(ROLE_LABELS, role)), "") +
            '</text><text x="' +
            compat.format(compat.sub(compat.add(x, card_width), 16), ".2f") +
            '" y="' +
            compat.format(ty, ".2f") +
            '" text-anchor="end" font-size="12" font-weight="bold">' +
            compat.format(count, "") +
            "</text></g>",
        );
        ty = compat.add(ty, 20);
      }
      compat.append(cards, "</g>");
    }
    y = compat.add(y, compat.add(row_height, 16));
  }
  height = compat.add(compat.sub(y, start_y), 8);
  return [
    height,
    [
      '<g class="military-summary"><style>.military-summary text{stroke:none;fill:#292a28}</style><rect x="0" y="' +
        compat.format(start_y, ".2f") +
        '" width="' +
        compat.format(width, ".2f") +
        '" height="' +
        compat.format(height, ".2f") +
        '" fill="#f4e9ce"/><text x="40" y="' +
        compat.format(compat.add(start_y, 30), ".2f") +
        '" font-size="18" font-weight="bold">Military summary</text><text x="40" y="' +
        compat.format(compat.add(start_y, 50), ".2f") +
        '" font-size="11">Major empires; current plot-referenced military units.</text><text x="40" y="' +
        compat.format(compat.add(start_y, 66), ".2f") +
        '" font-size="11">Civilians, city-states and barbarians excluded. Counts are not combat strength.</text>',
      ...compat.iter(cards),
      "</g>",
    ],
  ];
}
export function render_svg(
  world: any,
  style: any = null,
  caption_lines: any = null,
  mode: any = "political",
  interactive: any = false,
): any {
  let a: any,
    allies: any,
    ally: any,
    angle: any,
    armies: any,
    at_position: any,
    b: any,
    badge: any,
    box: any,
    broken: any,
    bx: any,
    by: any,
    canvas_height: any,
    capital: any,
    capital_position: any,
    caption: any,
    city: any,
    city_attrs: any,
    city_positions: any,
    civ: any,
    civ_id: any,
    civs: any,
    color: any,
    colors: any,
    config: any,
    count_font: any,
    country_label: any,
    cx: any,
    cy: any,
    dash: any,
    domain: any,
    domains: any,
    dx: any,
    dy: any,
    edge: any,
    extent: any,
    feature: any,
    font: any,
    gap: any,
    height: any,
    i: any,
    icon: any,
    index: any,
    key: any,
    kind: any,
    legend: any,
    length: any,
    margin: any,
    marker_size: any,
    minor: any,
    minor_style: any,
    mx: any,
    my: any,
    nx: any,
    ny: any,
    occupied: any,
    out: any,
    owner: any,
    owner_attr: any,
    owner_label: any,
    pairs: any,
    panel: any,
    panel_height: any,
    panel_width: any,
    path: any,
    point_radius: any,
    points: any,
    positions: any,
    radius: any,
    relation: any,
    rgb: any,
    roles: any,
    segment: any,
    shift: any,
    size: any,
    stacks: any,
    star_fill: any,
    stroke_width: any,
    suffix: any,
    symbol: any,
    synthetic: any,
    terrain: any,
    terrain_colors: any,
    terrain_groups: any,
    territories: any,
    tile: any,
    tiles: any,
    title: any,
    tx: any,
    ty: any,
    units: any,
    unknown: any,
    unowned_pattern: any,
    value: any,
    vh: any,
    vw: any,
    water_territories: any,
    weight: any,
    width: any,
    x: any,
    y: any;
  validate_world(world);
  const religionWorld = compat.unwrap(world);
  validateReligion(religionWorld);
  if (mode === "religion") {
    const unavailable = religionAvailability(religionWorld);
    if (unavailable) throw new compat.ParseError(unavailable);
  }
  if (
    compat.truth(
      !compat.has(["political", "physical", "army", "religion"], mode),
    )
  ) {
    throw new compat.ParseError(
      "mode must be political, physical, army or religion",
    );
  }
  armies = compat.truth(compat.eq(mode, "army"))
    ? army_groups(world)
    : compat.dict([]);
  if (
    compat.truth(
      compat.and(
        () => compat.eq(mode, "physical"),
        () =>
          compat.any(
            (() => {
              const __v65: any[] = [];
              for (const __v66 of compat.iter(compat.get(world, "tiles"))) {
                let t: any = __v66;
                __v65.push(
                  compat.or(
                    () =>
                      !compat.truth(
                        compat.isinstance(
                          compat.get(t, "terrain", null),
                          compat.str,
                        ),
                      ),
                    () => !compat.truth(compat.get(t, "terrain")),
                  ),
                );
              }
              return __v65;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "physical mode requires resolved terrain names; supply a matching --ruleset for save extraction or a matching --map for replay rendering",
    );
  }
  config = compat.dict(DEFAULT_STYLE);
  if (compat.truth(style)) {
    unknown = compat.sub(compat.set(style), compat.set(config));
    if (compat.truth(unknown)) {
      throw new compat.ParseError(
        "unsupported style keys: " + compat.format(compat.sorted(unknown), ""),
      );
    }
    compat.update(config, style);
  }
  if (!Object.hasOwn(THEMES, compat.get(config, "theme"))) {
    throw new compat.ParseError("theme must be atlas, parchment or minimalist");
  }
  const theme = THEMES[compat.get(config, "theme") as keyof typeof THEMES];
  for (const __v67 of compat.iter([
    "oceanColor",
    "ownedWaterColor",
    "unownedColor",
    "borderColor",
    "roadColor",
    "railroadColor",
    "cityStateLabelColor",
    "riverColor",
    "unknownTerrainColor",
  ])) {
    key = __v67;
    if (
      compat.truth(
        !compat.truth(
          compat.fullmatch("#[0-9a-fA-F]{6}", compat.get(config, key)),
        ),
      )
    ) {
      throw new compat.ParseError("invalid color: " + compat.format(key, ""));
    }
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "borderWidth")),
          ),
        () =>
          !compat.truth(
            compat.compare(0, compat.get(config, "borderWidth")) < 0 &&
              compat.compare(compat.get(config, "borderWidth"), 10) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("borderWidth must be between 0 and 10");
  }
  for (const __v68 of compat.iter([
    "showCities",
    "showMountains",
    "showCivilizationNames",
    "showForests",
    "showNaturalWonders",
    "shadeAlliedCityStates",
    "showOwnedWater",
    "showHexGrid",
    "showRoads",
    "showCapitals",
    "showRivers",
    "showUnownedPattern",
    "showMilitarySummary",
  ])) {
    key = __v68;
    if (compat.truth(compat.type(compat.get(config, key)) !== compat.bool)) {
      throw new compat.ParseError(compat.format(key, "") + " must be boolean");
    }
  }
  for (const __v69 of compat.iter(["countryFontSize", "cityFontSize"])) {
    key = __v69;
    if (
      compat.truth(
        compat.or(
          () =>
            !compat.has(
              [compat.int, compat.float],
              compat.type(compat.get(config, key)),
            ),
          () =>
            !compat.truth(
              compat.compare(6, compat.get(config, key)) <= 0 &&
                compat.compare(compat.get(config, key), 48) <= 0,
            ),
        ),
      )
    ) {
      throw new compat.ParseError(
        compat.format(key, "") + " must be between 6 and 48",
      );
    }
  }
  if (
    compat.truth(
      !compat.has(
        ["player", "civilization"],
        compat.get(config, "empireLabels"),
      ),
    )
  ) {
    throw new compat.ParseError("empireLabels must be player or civilization");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "allyShade")),
          ),
        () =>
          !compat.truth(
            compat.compare(0.05, compat.get(config, "allyShade")) <= 0 &&
              compat.compare(compat.get(config, "allyShade"), 0.85) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("allyShade must be between 0.05 and 0.85");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "mountainSize")),
          ),
        () =>
          !compat.truth(
            compat.compare(6, compat.get(config, "mountainSize")) <= 0 &&
              compat.compare(compat.get(config, "mountainSize"), 30) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("mountainSize must be between 6 and 30");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "capitalSize")),
          ),
        () =>
          !compat.truth(
            compat.compare(6, compat.get(config, "capitalSize")) <= 0 &&
              compat.compare(compat.get(config, "capitalSize"), 16) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("capitalSize must be between 6 and 16");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "roadWidth")),
          ),
        () =>
          !compat.truth(
            compat.compare(0.5, compat.get(config, "roadWidth")) <= 0 &&
              compat.compare(compat.get(config, "roadWidth"), 5) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("roadWidth must be between 0.5 and 5");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "riverWidth")),
          ),
        () =>
          !compat.truth(
            compat.compare(0.5, compat.get(config, "riverWidth")) <= 0 &&
              compat.compare(compat.get(config, "riverWidth"), 5) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("riverWidth must be between 0.5 and 5");
  }
  if (
    compat.truth(
      !compat.truth(
        compat.isinstance(compat.get(config, "colorOverrides"), compat.dict),
      ),
    )
  ) {
    throw new compat.ParseError(
      "colorOverrides must map civilization IDs to colors",
    );
  }
  for (const __v70 of compat.iter(
    compat.items(compat.get(config, "colorOverrides")),
  )) {
    {
      const __v71 = compat.iter(__v70);
      key = __v71[0];
      value = __v71[1];
    }
    if (
      compat.truth(
        compat.or(
          () => !compat.truth(compat.isdigit(compat.str(key))),
          () => !compat.truth(compat.fullmatch("#[0-9a-fA-F]{6}", value)),
        ),
      )
    ) {
      throw new compat.ParseError("invalid color override");
    }
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.isinstance(compat.get(config, "terrainColors"), compat.dict),
          ),
        () =>
          compat.any(
            (() => {
              const __v72: any[] = [];
              for (const __v73 of compat.iter(
                compat.items(compat.get(config, "terrainColors")),
              )) {
                let [k, v] = compat.iter(__v73);
                __v72.push(
                  compat.or(
                    () => !compat.truth(compat.isinstance(k, compat.str)),
                    () =>
                      compat.or(
                        () => !compat.truth(compat.startswith(k, "TERRAIN_")),
                        () =>
                          compat.or(
                            () =>
                              !compat.truth(compat.isinstance(v, compat.str)),
                            () =>
                              !compat.truth(
                                compat.fullmatch("#[0-9a-fA-F]{6}", v),
                              ),
                          ),
                      ),
                  ),
                );
              }
              return __v72;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "terrainColors must map terrain type keys to hex colors",
    );
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.has(
            [compat.int, compat.float],
            compat.type(compat.get(config, "armyMarkerSize")),
          ),
        () =>
          !compat.truth(
            compat.compare(6, compat.get(config, "armyMarkerSize")) <= 0 &&
              compat.compare(compat.get(config, "armyMarkerSize"), 16) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("armyMarkerSize must be between 6 and 16");
  }
  if (
    compat.truth(
      !compat.has(["domain", "detailed"], compat.get(config, "armyIcons")),
    )
  ) {
    throw new compat.ParseError("armyIcons must be domain or detailed");
  }
  if (
    compat.truth(
      compat.and(
        () => !compat.eq(mode, "army"),
        () =>
          compat.or(
            () => compat.get(config, "showMilitarySummary"),
            () => !compat.eq(compat.get(config, "armyIcons"), "domain"),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "detailed army icons and military summary require --mode army",
    );
  }
  {
    const __v74 = compat.iter([16, 40]);
    radius = __v74[0];
    margin = __v74[1];
  }
  {
    const __v75 = compat.iter([
      compat.get(compat.get(world, "game"), "width"),
      compat.get(compat.get(world, "game"), "height"),
    ]);
    width = __v75[0];
    height = __v75[1];
  }
  let religionHeaderHeight = 0;
  function project(point: any): any {
    return [
      compat.add(
        compat.div(
          compat.mul(
            compat.mul(compat.add(compat.get(point, 0), 1), Math.sqrt(3)),
            radius,
          ),
          2,
        ),
        margin,
      ),
      compat.add(
        compat.add(
          compat.div(
            compat.mul(
              compat.sub(
                compat.add(compat.mul(3, compat.sub(height, 1)), 2),
                compat.get(point, 1),
              ),
              radius,
            ),
            2,
          ),
          margin,
        ),
        24 + religionHeaderHeight,
      ),
    ];
  }
  function center(tile: any): any {
    return project([
      compat.add(
        compat.mul(2, compat.get(tile, "x")),
        compat.bitAnd(compat.get(tile, "y"), 1),
      ),
      compat.mul(3, compat.get(tile, "y")),
    ]);
  }
  function coords(point: any): any {
    let x: any, y: any;
    {
      const __v76 = compat.iter(project(point));
      x = __v76[0];
      y = __v76[1];
    }
    return compat.format(x, ".2f") + "," + compat.format(y, ".2f");
  }
  vw = compat.add(
    compat.div(
      compat.mul(
        compat.mul(compat.add(compat.mul(2, width), 1), Math.sqrt(3)),
        radius,
      ),
      2,
    ),
    compat.mul(2, margin),
  );
  const religionLegendLayout =
    mode === "religion"
      ? layoutReligionLegend(religionWorld, vw - 2 * margin)
      : null;
  religionHeaderHeight = religionLegendLayout
    ? religionLegendLayout.height + 20
    : 0;
  vh = compat.add(
    compat.add(
      compat.div(compat.mul(compat.add(compat.mul(3, height), 1), radius), 2),
      compat.mul(2, margin),
    ),
    24 + religionHeaderHeight,
  );
  if (
    compat.truth(
      compat.and(
        () => caption_lines !== null,
        () =>
          compat.or(
            () => !compat.truth(compat.isinstance(caption_lines, compat.list)),
            () =>
              compat.any(
                (() => {
                  const __v77: any[] = [];
                  for (const __v78 of compat.iter(caption_lines)) {
                    let line: any = __v78;
                    __v77.push(
                      !compat.truth(compat.isinstance(line, compat.str)),
                    );
                  }
                  return __v77;
                })(),
              ),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "caption_lines must be a list of strings or None",
    );
  }
  canvas_height = compat.add(
    vh,
    compat.truth(caption_lines !== null) ? 120 : 0,
  );
  synthetic = compat.eq(
    compat.get(compat.get(world, "source"), "kind"),
    "synthetic",
  );
  title = compat.truth(synthetic)
    ? "SYNTHETIC DEMO \u2014 NOT PARSED GAME DATA"
    : compat.format(
        compat.get(
          compat.dict([
            ["political", "Political"],
            ["physical", "Physical terrain"],
            ["army", "Army"],
            ["religion", "Religion"],
          ]),
          mode,
        ),
        "",
      ) +
      " map \u00b7 turn " +
      compat.format(compat.get(compat.get(world, "game"), "turn", "?"), "");
  out = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      compat.format(vw, ".2f") +
      " " +
      compat.format(canvas_height, ".2f") +
      '">',
    "<title>" + compat.format(compat.escape(title), "") + "</title>",
    '<rect width="100%" height="100%" fill="' +
      compat.format(compat.get(config, "oceanColor"), "") +
      '"/>',
    `<style>text{font-family:Georgia,serif;fill:${theme.text};paint-order:stroke;stroke:${theme.halo};stroke-width:2px;stroke-linejoin:round} .country{font-weight:bold;letter-spacing:1px} .city-label,.city-state-label{font-family:${theme.font};fill:${theme.city};stroke:${theme.cityHalo};stroke-width:2.4px;font-weight:600} .city-state-label{stroke:${compat.get(config, "theme") === "atlas" ? compat.get(config, "cityStateLabelColor") : theme.cityHalo}}</style>`,
    '<text x="' +
      compat.format(margin, "") +
      '" y="30" font-size="13">' +
      compat.format(compat.escape(title), "") +
      "</text>",
  ];
  unowned_pattern = compat.and(
    () => !compat.eq(mode, "physical"),
    () =>
      compat.and(
        () => compat.get(config, "showUnownedPattern"),
        () =>
          compat.any(
            (() => {
              const __v79: any[] = [];
              for (const __v80 of compat.iter(compat.get(world, "tiles"))) {
                let t: any = __v80;
                __v79.push(
                  compat.and(
                    () => compat.eq(compat.get(t, "landWater"), "land"),
                    () => compat.get(t, "owner") === null,
                  ),
                );
              }
              return __v79;
            })(),
          ),
      ),
  );
  if (compat.truth(unowned_pattern)) {
    compat.append(
      out,
      '<defs><pattern id="unowned-land" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="' +
        compat.format(compat.get(config, "unownedColor"), "") +
        '"/><path d="M-1,1 L1,-1 M0,7 L7,0 M6,8 L8,6" stroke="#a99e84" stroke-width="0.6" opacity="0.45"/></pattern></defs>',
    );
  }
  civs = (() => {
    const __v81: any[] = [];
    for (const __v82 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v82;
      __v81.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v81);
  })();
  colors = compat.dict([]);
  for (const __v83 of compat.iter(compat.enumerate(compat.sorted(civs)))) {
    {
      const __v84 = compat.iter(__v83);
      index = __v84[0];
      civ_id = __v84[1];
    }
    color = compat.or(
      () =>
        compat.get(
          compat.get(config, "colorOverrides"),
          compat.str(civ_id),
          null,
        ),
      () =>
        compat.or(
          () => compat.get(compat.get(civs, civ_id), "color", null),
          () => compat.get(PALETTE, compat.mod(index, compat.len(PALETTE))),
        ),
    );
    if (
      compat.truth(!compat.truth(compat.fullmatch("#[0-9a-fA-F]{6}", color)))
    ) {
      throw new compat.ParseError("invalid civilization color");
    }
    compat.put(
      colors,
      civ_id,
      presentationColor(color, compat.get(config, "theme")),
    );
  }
  function label(civ: any): any {
    return empire_label(civ, compat.get(config, "empireLabels"));
  }
  allies = compat.dict([]);
  if (
    compat.truth(
      compat.and(
        () => !compat.eq(mode, "physical"),
        () => compat.get(config, "shadeAlliedCityStates"),
      ),
    )
  ) {
    for (const __v85 of compat.iter(compat.sorted(compat.items(civs)))) {
      {
        const __v86 = compat.iter(__v85);
        civ_id = __v86[0];
        civ = __v86[1];
      }
      if (
        compat.truth(
          compat.and(
            () => compat.eq(compat.get(civ, "kind", null), "city-state"),
            () =>
              compat.and(
                () => compat.get(civ, "allianceKnown", null) === true,
                () => compat.get(civ, "ally", null) !== null,
              ),
          ),
        )
      ) {
        ally = compat.get(civ, "ally");
        compat.put(allies, civ_id, ally);
        if (
          compat.truth(
            !compat.has(
              compat.get(config, "colorOverrides"),
              compat.str(civ_id),
            ),
          )
        ) {
          rgb = (() => {
            const __v87: any[] = [];
            for (const __v88 of compat.iter([1, 3, 5])) {
              let i: any = __v88;
              __v87.push(
                compat.int(
                  compat.slice(
                    compat.get(colors, ally),
                    i,
                    compat.add(i, 2),
                    null,
                  ),
                  16,
                ),
              );
            }
            return __v87;
          })();
          compat.put(
            colors,
            civ_id,
            compat.add(
              "#",
              compat.join(
                "",
                (() => {
                  const __v89: any[] = [];
                  for (const __v90 of compat.iter(rgb)) {
                    let n: any = __v90;
                    __v89.push(
                      compat.format(
                        compat.round(
                          compat.add(
                            n,
                            compat.mul(
                              compat.sub(255, n),
                              compat.get(config, "allyShade"),
                            ),
                          ),
                        ),
                        "02X",
                      ),
                    );
                  }
                  return __v89;
                })(),
              ),
            ),
          );
        }
      }
    }
  }
  territories = compat.defaultdict(compat.list);
  water_territories = compat.defaultdict(compat.list);
  for (const __v91 of compat.iter(
    compat.sorted(
      compat.get(world, "tiles"),
      compat.dict([
        ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
      ]),
    ),
  )) {
    tile = __v91;
    if (compat.truth(compat.eq(compat.get(tile, "landWater"), "land"))) {
      compat.append(compat.get(territories, compat.get(tile, "owner")), tile);
    } else {
      if (
        compat.truth(
          compat.and(
            () => compat.get(tile, "owner") !== null,
            () => compat.get(config, "showOwnedWater"),
          ),
        )
      ) {
        compat.append(
          compat.get(water_territories, compat.get(tile, "owner")),
          tile,
        );
      }
    }
  }
  legend = [];
  if (compat.truth(unowned_pattern)) {
    compat.append(legend, "Hatched cream: unclaimed land.");
  }
  if (
    compat.truth(
      compat.and(
        () => !compat.eq(mode, "physical"),
        () => water_territories,
      ),
    )
  ) {
    compat.append(
      legend,
      "Blue water: claimed territory. Colored outlines identify its empire.",
    );
  }
  if (compat.truth(allies)) {
    compat.append(legend, "Lighter land: allied city-states.");
  }
  if (
    compat.truth(
      compat.and(
        () => compat.get(config, "showCities"),
        () =>
          compat.and(
            () => compat.get(config, "showCapitals"),
            () =>
              compat.any(
                (() => {
                  const __v92: any[] = [];
                  for (const __v93 of compat.iter(
                    compat.get(world, "cities"),
                  )) {
                    let c: any = __v93;
                    __v92.push(compat.get(c, "capital", null) === true);
                  }
                  return __v92;
                })(),
              ),
          ),
      ),
    )
  ) {
    compat.append(
      legend,
      "Gold stars: empire capitals. Purple diamonds: city-state capitals.",
    );
  }
  if (
    compat.truth(
      compat.and(
        () => compat.get(config, "showRoads"),
        () =>
          compat.any(
            (() => {
              const __v94: any[] = [];
              for (const __v95 of compat.iter(compat.get(world, "tiles"))) {
                let t: any = __v95;
                __v94.push(
                  compat.and(
                    () => compat.get(t, "routeKnown", null),
                    () => compat.get(t, "routeId", null) !== null,
                  ),
                );
              }
              return __v94;
            })(),
          ),
      ),
    )
  ) {
    compat.append(legend, "Dashed red routes: pillaged.");
  }
  if (compat.truth(compat.eq(mode, "physical"))) {
    compat.insert(
      legend,
      0,
      "Terrain colors; hill, mountain and vegetation symbols. Territorial borders omitted.",
    );
  }
  if (compat.truth(compat.eq(mode, "army"))) {
    legend = compat.add(
      [
        "Army: swords = land; ships = naval; planes = air; shields = other/mixed. Counts: stacks of 2+ units.",
      ],
      (() => {
        const __v96: any[] = [];
        for (const __v97 of compat.iter(legend)) {
          let entry: any = __v97;
          if (!compat.truth(compat.startswith(entry, "Gold stars:"))) continue;
          __v96.push(entry);
        }
        return __v96;
      })(),
    );
    if (compat.truth(compat.eq(compat.get(config, "armyIcons"), "detailed"))) {
      compat.put(
        legend,
        0,
        "Army: ruleset military roles; shields = mixed roles. Counts: stacks of 2+ units. SVG tooltips list types.",
      );
    }
  }
  if (mode === "religion") {
    legend = [
      "Overview: land/circles show city majority, not empire religion. Selected faith: follower-share heatmap. Diamond: holy religion. Gray: unknown; cream: no majority.",
    ];
  }
  if (compat.truth(legend)) {
    compat.append(
      out,
      '<text x="' +
        compat.format(margin, "") +
        '" y="49" font-size="10">' +
        compat.format(compat.escape(compat.join(" ", legend)), "") +
        "</text>",
    );
  }
  if (compat.truth(compat.eq(mode, "physical"))) {
    terrain_groups = compat.defaultdict(compat.list);
    terrain_colors = compat.dict(
      TERRAIN_COLORS,
      compat.get(config, "terrainColors"),
    );
    compat.put(
      terrain_colors,
      "TERRAIN_OCEAN",
      compat.get(
        compat.get(config, "terrainColors"),
        "TERRAIN_OCEAN",
        compat.get(config, "oceanColor"),
      ),
    );
    compat.put(
      terrain_colors,
      "TERRAIN_COAST",
      compat.get(
        compat.get(config, "terrainColors"),
        "TERRAIN_COAST",
        compat.get(config, "ownedWaterColor"),
      ),
    );
    for (const __v98 of compat.iter(compat.get(world, "tiles"))) {
      tile = __v98;
      compat.append(
        compat.get(terrain_groups, compat.get(tile, "terrain")),
        tile,
      );
    }
    for (const __v99 of compat.iter(
      compat.sorted(compat.items(terrain_groups)),
    )) {
      {
        const __v100 = compat.iter(__v99);
        terrain = __v100[0];
        tiles = __v100[1];
      }
      path = compat.join(
        " ",
        (() => {
          const __v101: any[] = [];
          for (const __v102 of compat.iter(polygon_rings(tiles))) {
            let ring: any = __v102;
            __v101.push(
              compat.add(
                compat.add(
                  "M ",
                  compat.join(
                    " L ",
                    (() => {
                      const __v103: any[] = [];
                      for (const __v104 of compat.iter(ring)) {
                        let p: any = __v104;
                        __v103.push(coords(p));
                      }
                      return __v103;
                    })(),
                  ),
                ),
                " Z",
              ),
            );
          }
          return __v101;
        })(),
      );
      color = compat.get(
        terrain_colors,
        terrain,
        compat.get(config, "unknownTerrainColor"),
      );
      suffix = compat.truth(!compat.has(terrain_colors, terrain))
        ? " (unmapped terrain color)"
        : "";
      compat.append(
        out,
        '<path data-terrain="' +
          compat.format(
            compat.escape(terrain, compat.dict([["quote", true]])),
            "",
          ) +
          '" d="' +
          compat.format(path, "") +
          '" fill="' +
          compat.format(color, "") +
          '" fill-rule="evenodd"><title>' +
          compat.format(compat.escape(compat.add(terrain, suffix)), "") +
          "</title></path>",
      );
    }
  }
  for (const __v105 of compat.iter(
    compat.truth(!compat.eq(mode, "physical"))
      ? compat.sorted(compat.items(water_territories))
      : [],
  )) {
    {
      const __v106 = compat.iter(__v105);
      owner = __v106[0];
      tiles = __v106[1];
    }
    path = compat.join(
      " ",
      (() => {
        const __v107: any[] = [];
        for (const __v108 of compat.iter(polygon_rings(tiles))) {
          let ring: any = __v108;
          __v107.push(
            compat.add(
              compat.add(
                "M ",
                compat.join(
                  " L ",
                  (() => {
                    const __v109: any[] = [];
                    for (const __v110 of compat.iter(ring)) {
                      let p: any = __v110;
                      __v109.push(coords(p));
                    }
                    return __v109;
                  })(),
                ),
              ),
              " Z",
            ),
          );
        }
        return __v107;
      })(),
    );
    caption =
      "Water owned by " + compat.format(label(compat.get(civs, owner)), "");
    compat.append(
      out,
      '<path data-owner="' +
        compat.format(owner, "") +
        '" data-surface="water" d="' +
        compat.format(path, "") +
        '" fill="' +
        compat.format(compat.get(config, "ownedWaterColor"), "") +
        '" stroke="' +
        compat.format(compat.get(colors, owner), "") +
        '" stroke-width="3.6" stroke-linejoin="round" fill-rule="evenodd"><title>' +
        compat.format(compat.escape(caption), "") +
        "</title></path>",
    );
  }
  for (const __v111 of compat.iter(
    compat.truth(!compat.eq(mode, "physical"))
      ? compat.sorted(
          compat.items(territories),
          compat.dict([
            [
              "key",
              (p: any) =>
                compat.truth(compat.get(p, 0) === null) ? -1 : compat.get(p, 0),
            ],
          ]),
        )
      : [],
  )) {
    {
      const __v112 = compat.iter(__v111);
      owner = __v112[0];
      tiles = __v112[1];
    }
    color = compat.get(colors, owner, compat.get(config, "unownedColor"));
    if (
      compat.truth(
        compat.and(
          () => owner === null,
          () => unowned_pattern,
        ),
      )
    ) {
      color = "url(#unowned-land)";
    }
    path = compat.join(
      " ",
      (() => {
        const __v113: any[] = [];
        for (const __v114 of compat.iter(polygon_rings(tiles))) {
          let ring: any = __v114;
          __v113.push(
            compat.add(
              compat.add(
                "M ",
                compat.join(
                  " L ",
                  (() => {
                    const __v115: any[] = [];
                    for (const __v116 of compat.iter(ring)) {
                      let p: any = __v116;
                      __v115.push(coords(p));
                    }
                    return __v115;
                  })(),
                ),
              ),
              " Z",
            ),
          );
        }
        return __v113;
      })(),
    );
    caption = compat.truth(owner === null)
      ? "Unowned land"
      : label(compat.get(civs, owner));
    relation = compat.truth(compat.has(allies, owner))
      ? " \u2014 allied with " +
        compat.format(label(compat.get(civs, compat.get(allies, owner))), "")
      : "";
    owner_label = compat.truth(owner !== null) ? owner : "unowned";
    compat.append(
      out,
      '<path data-owner="' +
        compat.format(owner_label, "") +
        '" data-surface="land" d="' +
        compat.format(path, "") +
        '" fill="' +
        compat.format(color, "") +
        '" fill-rule="evenodd"><title>' +
        compat.format(compat.escape(compat.add(caption, relation)), "") +
        "</title></path>",
    );
  }
  if (mode === "religion") {
    for (const entry of religionLegendLayout!.items) {
      const legendX = margin + entry.x,
        legendY = 57 + entry.y;
      compat.append(
        out,
        `<g class="religion-legend" data-religion-id="${entry.id ?? "unknown"}"><title>${compat.escape(entry.name)}</title><rect x="${legendX}" y="${legendY}" width="9" height="9" fill="${entry.color}" stroke="#292a28"/><text x="${legendX + 13}" y="${legendY + 8}" font-size="9">${compat.escape(entry.text)}</text></g>`,
      );
    }
    compat.append(
      out,
      `<g class="religion-heatmap-legend" data-x="${margin}" data-y="${57 + religionLegendLayout!.height}"><text x="${margin}" y="${57 + religionLegendLayout!.height + 9}" font-size="9">Overview: territory colors show assigned-city majority. Select a religion to see its follower share.</text></g>`,
    );
    compat.append(
      out,
      religionTerritories(
        religionWorld,
        (tiles) => compat.unwrap(polygon_rings(compat.wrapJson(tiles))),
        (point) => coords(point),
      ),
    );
  }
  if (compat.truth(compat.get(config, "showRoads"))) {
    for (const __v117 of compat.iter(route_segments(world))) {
      segment = __v117;
      kind = compat.get(segment, "kind");
      broken = compat.get(segment, "pillaged");
      color = compat.truth(broken)
        ? "#9e4b40"
        : compat.truth(compat.eq(kind, "railroad"))
          ? compat.get(config, "railroadColor")
          : compat.get(config, "roadColor");
      dash = compat.truth(broken)
        ? ' stroke-dasharray="4 3"'
        : compat.truth(compat.eq(kind, "railroad"))
          ? ' stroke-dasharray="1.5 2"'
          : "";
      {
        const __v118 = compat.iter([
          coords(compat.get(segment, "start")),
          coords(compat.get(segment, "end")),
        ]);
        a = __v118[0];
        b = __v118[1];
      }
      caption = compat.add(
        compat.truth(broken) ? "Pillaged " : "",
        compat.capitalize(kind),
      );
      compat.append(
        out,
        '<g class="route ' +
          compat.format(kind, "") +
          '" data-pillaged="' +
          compat.format(compat.lower(compat.str(broken)), "") +
          '"><title>' +
          compat.format(caption, "") +
          '</title><path d="M ' +
          compat.format(a, "") +
          " L " +
          compat.format(b, "") +
          '" fill="none" stroke="#f4e8cd" stroke-width="' +
          compat.format(compat.add(compat.get(config, "roadWidth"), 1), ".2f") +
          '" stroke-linecap="round"' +
          compat.format(dash, "") +
          '/><path d="M ' +
          compat.format(a, "") +
          " L " +
          compat.format(b, "") +
          '" fill="none" stroke="' +
          compat.format(color, "") +
          '" stroke-width="' +
          compat.format(compat.get(config, "roadWidth"), ".2f") +
          '" stroke-linecap="round"' +
          compat.format(dash, "") +
          "/></g>",
      );
    }
  }
  // Use the territory lattice, drawing shared hex edges only once.
  const gridEdges = new Map<string, string>();
  for (const surfaceTile of compat.get(world, "tiles")) {
    const vertices = lattice(surfaceTile);
    if (compat.get(surfaceTile, "feature", null) === "FEATURE_ICE") {
      out.push(
        '<path class="ice" pointer-events="none" d="M ' +
          vertices.map(coords).join(" L ") +
          ' Z" fill="#edf7fa" stroke="#b4d3df" stroke-width="0.6"><title>Ice</title></path>',
      );
    }
    if (compat.get(config, "showHexGrid")) {
      for (let i = 0; i < 6; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % 6];
        const key = [a.join(","), b.join(",")].sort().join("|");
        gridEdges.set(key, "M " + coords(a) + " L " + coords(b));
      }
    }
  }
  if (gridEdges.size) {
    out.push(
      '<path class="hex-grid" pointer-events="none" d="' +
        [...gridEdges.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, path]) => path)
          .join(" ") +
        '" fill="none" stroke="' +
        theme.grid +
        '" stroke-opacity="0.22" stroke-width="0.55"/>',
    );
  }
  for (const __v119 of compat.iter(boundary_edges(world))) {
    {
      const __v120 = compat.iter(__v119);
      kind = __v120[0];
      a = __v120[1];
      b = __v120[2];
    }
    if (
      compat.truth(
        compat.and(
          () => compat.eq(mode, "physical"),
          () => compat.eq(kind, "border"),
        ),
      )
    ) {
      continue;
    }
    stroke_width = compat.mul(
      compat.get(config, "borderWidth"),
      compat.truth(compat.eq(kind, "coast")) ? 1.3 : 1,
    );
    compat.append(
      out,
      '<path d="M ' +
        compat.format(coords(a), "") +
        " L " +
        compat.format(coords(b), "") +
        '" fill="none" stroke="' +
        compat.format(compat.get(config, "borderColor"), "") +
        '" stroke-width="' +
        compat.format(stroke_width, ".2f") +
        '"/>',
    );
  }
  if (compat.truth(compat.get(config, "showRivers"))) {
    for (const __v121 of compat.iter(
      compat.sorted(
        compat.get(world, "tiles"),
        compat.dict([
          ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
        ]),
      ),
    )) {
      tile = __v121;
      points = lattice(tile);
      for (const __v122 of compat.iter(
        compat.or(
          () => compat.get(tile, "riverEdges", null),
          () => [],
        ),
      )) {
        edge = __v122;
        i = compat.get(
          compat.dict([
            ["E", 1],
            ["SE", 2],
            ["SW", 3],
          ]),
          edge,
        );
        {
          const __v123 = compat.iter([
            compat.get(points, i),
            compat.get(points, compat.add(i, 1)),
          ]);
          a = __v123[0];
          b = __v123[1];
        }
        pairs = [[a, b]];
        nx = compat.add(
          compat.get(tile, "x"),
          compat.get(
            compat.dict([
              ["E", 1],
              ["SE", compat.bitAnd(compat.get(tile, "y"), 1)],
              ["SW", compat.sub(compat.bitAnd(compat.get(tile, "y"), 1), 1)],
            ]),
            edge,
          ),
        );
        ny = compat.truth(compat.eq(edge, "E"))
          ? compat.get(tile, "y")
          : compat.sub(compat.get(tile, "y"), 1);
        if (
          compat.truth(
            compat.and(
              () => compat.get(compat.get(world, "game"), "wrapX"),
              () =>
                compat.and(
                  () =>
                    compat.compare(0, ny) <= 0 &&
                    compat.compare(ny, height) < 0,
                  () =>
                    !compat.truth(
                      compat.compare(0, nx) <= 0 &&
                        compat.compare(nx, width) < 0,
                    ),
                ),
            ),
          )
        ) {
          shift = compat.truth(compat.compare(nx, 0) < 0)
            ? compat.mul(2, width)
            : compat.mul(-2, width);
          compat.append(pairs, [
            [compat.add(compat.get(a, 0), shift), compat.get(a, 1)],
            [compat.add(compat.get(b, 0), shift), compat.get(b, 1)],
          ]);
        }
        for (const __v124 of compat.iter(pairs)) {
          {
            const __v125 = compat.iter(__v124);
            a = __v125[0];
            b = __v125[1];
          }
          compat.append(
            out,
            '<path class="river" data-edge="' +
              compat.format(edge, "") +
              '" d="M ' +
              compat.format(coords(a), "") +
              " L " +
              compat.format(coords(b), "") +
              '" fill="none" stroke="' +
              compat.format(compat.get(config, "riverColor"), "") +
              '" stroke-width="' +
              compat.format(compat.get(config, "riverWidth"), ".2f") +
              '" stroke-linecap="round"/>',
          );
        }
      }
    }
  }
  if (compat.truth(compat.eq(mode, "physical"))) {
    for (const __v126 of compat.iter(
      compat.sorted(
        compat.get(world, "tiles"),
        compat.dict([
          ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
        ]),
      ),
    )) {
      tile = __v126;
      {
        const __v127 = compat.iter(center(tile));
        x = __v127[0];
        y = __v127[1];
      }
      if (
        compat.truth(compat.eq(compat.get(tile, "elevation", null), "hills"))
      ) {
        compat.append(
          out,
          '<path class="hill" data-x="' +
            compat.format(compat.get(tile, "x"), "") +
            '" data-y="' +
            compat.format(compat.get(tile, "y"), "") +
            '" d="M' +
            compat.format(compat.sub(x, 6), ".2f") +
            "," +
            compat.format(compat.add(y, 2), ".2f") +
            " Q" +
            compat.format(compat.sub(x, 3), ".2f") +
            "," +
            compat.format(compat.sub(y, 4), ".2f") +
            " " +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.add(y, 2), ".2f") +
            " Q" +
            compat.format(compat.add(x, 3), ".2f") +
            "," +
            compat.format(compat.sub(y, 3), ".2f") +
            " " +
            compat.format(compat.add(x, 6), ".2f") +
            "," +
            compat.format(compat.add(y, 2), ".2f") +
            '" fill="none" stroke="#695f48" stroke-width="1.2"><title>Hills</title></path>',
        );
      }
      feature = compat.get(tile, "feature", null);
      {
        if (
          compat.truth(
            compat.has(
              ["FEATURE_MARSH", "FEATURE_OASIS", "FEATURE_FLOOD_PLAINS"],
              feature,
            ),
          )
        ) {
          symbol = compat.get(
            compat.dict([
              ["FEATURE_MARSH", "\u2248"],
              ["FEATURE_OASIS", "\u25cb"],
              ["FEATURE_FLOOD_PLAINS", "~"],
            ]),
            feature,
          );
          compat.append(
            out,
            '<text class="terrain-feature" x="' +
              compat.format(x, ".2f") +
              '" y="' +
              compat.format(compat.add(y, 4), ".2f") +
              '" text-anchor="middle" font-size="14" style="fill:#397a6c"><title>' +
              compat.format(compat.escape(feature), "") +
              "</title>" +
              compat.format(symbol, "") +
              "</text>",
          );
        }
      }
    }
  }
  if (compat.truth(compat.get(config, "showMountains"))) {
    for (const __v130 of compat.iter(
      compat.sorted(
        compat.get(world, "tiles"),
        compat.dict([
          ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
        ]),
      ),
    )) {
      tile = __v130;
      if (
        compat.truth(compat.eq(compat.get(tile, "elevation", null), "mountain"))
      ) {
        {
          const __v131 = compat.iter(center(tile));
          x = __v131[0];
          y = __v131[1];
        }
        size = compat.get(config, "mountainSize");
        compat.append(
          out,
          '<g class="mountain" data-x="' +
            compat.format(compat.get(tile, "x"), "") +
            '" data-y="' +
            compat.format(compat.get(tile, "y"), "") +
            '"><title>Mountain</title><path d="M' +
            compat.format(compat.sub(x, compat.div(size, 2)), ".2f") +
            "," +
            compat.format(compat.add(y, compat.mul(size, 0.35)), ".2f") +
            " L" +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.sub(y, compat.mul(size, 0.65)), ".2f") +
            " L" +
            compat.format(compat.add(x, compat.div(size, 2)), ".2f") +
            "," +
            compat.format(compat.add(y, compat.mul(size, 0.35)), ".2f") +
            ' Z" fill="#858e8e" stroke="#242f35" stroke-width="1.3" stroke-linejoin="round"/><path d="M' +
            compat.format(compat.sub(x, compat.mul(size, 0.17)), ".2f") +
            "," +
            compat.format(compat.sub(y, compat.mul(size, 0.31)), ".2f") +
            " L" +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.sub(y, compat.mul(size, 0.65)), ".2f") +
            " L" +
            compat.format(compat.add(x, compat.mul(size, 0.17)), ".2f") +
            "," +
            compat.format(compat.sub(y, compat.mul(size, 0.31)), ".2f") +
            " L" +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.sub(y, compat.mul(size, 0.39)), ".2f") +
            ' Z" fill="#fff8e8"/></g>',
        );
      }
    }
  }
  if (compat.truth(compat.get(config, "showForests"))) {
    for (const __v132 of compat.iter(
      compat.sorted(
        compat.get(world, "tiles"),
        compat.dict([
          ["key", (t: any) => [compat.get(t, "y"), compat.get(t, "x")]],
        ]),
      ),
    )) {
      tile = __v132;
      if (
        compat.truth(
          compat.has(
            ["FEATURE_FOREST", "FEATURE_JUNGLE"],
            compat.get(tile, "feature", null),
          ),
        )
      ) {
        {
          const __v133 = compat.iter(center(tile));
          x = __v133[0];
          y = __v133[1];
        }
        compat.append(
          out,
          '<path d="M' +
            compat.format(compat.sub(x, 3), ".2f") +
            "," +
            compat.format(compat.add(y, 2), ".2f") +
            " l3,-7 l3,7 Z M" +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.add(y, 2), ".2f") +
            ' v3" fill="#36523c" opacity="0.65" stroke="#36523c" stroke-width="0.7"/>',
        );
      }
    }
  }
  occupied = [[margin, 15, compat.sub(vw, margin), 35]];
  if (compat.get(config, "showNaturalWonders")) {
    const wonderTiles = [...compat.iter(compat.get(world, "tiles"))]
      .filter((t) => compat.get(t, "naturalWonder", null))
      .sort(
        (a, b) =>
          compat.get(a, "y") - compat.get(b, "y") ||
          compat.get(a, "x") - compat.get(b, "x"),
      );
    const labelTiles = naturalWonderLabelTiles(
      wonderTiles.map((t) => compat.unwrap(t)),
      width,
      compat.get(compat.get(world, "game"), "wrapX"),
    );
    for (const tile of wonderTiles) {
      const wonder = compat.get(tile, "naturalWonder", null);
      if (!wonder) continue;
      const [wx, wy] = center(tile);
      const name = compat.get(wonder, "name", compat.get(wonder, "type"));
      const escapedName = compat.escape(name);
      const key = compat.escape(compat.get(wonder, "type"));
      const attributes = interactive
        ? ` role="button" tabindex="0" aria-label="${escapedName}, natural wonder"`
        : "";
      const showLabel = labelTiles.has(
        `${compat.get(tile, "x")},${compat.get(tile, "y")}`,
      );
      const labelMarkup = showLabel
        ? `<text class="natural-wonder-label" x="${wx}" y="${wy + 17}" text-anchor="middle" font-size="9">${escapedName}</text>`
        : "";
      compat.append(
        out,
        `<g class="natural-wonder-marker" data-natural-wonder="${key}" data-x="${compat.get(tile, "x")}" data-y="${compat.get(tile, "y")}"${attributes}><title>${escapedName} · Natural wonder</title><path d="M${wx},${wy - 7} L${wx + 7},${wy} L${wx},${wy + 7} L${wx - 7},${wy} Z" fill="#185b68" stroke="#f2d67b" stroke-width="1.8"/><path d="M${wx - 3.5},${wy + 2.5} L${wx},${wy - 3.5} L${wx + 3.5},${wy + 2.5} Z" fill="#f2d67b"/>${labelMarkup}</g>`,
      );
      const labelWidth = Math.min(String(name).length * 5, 240);
      compat.append(occupied, [
        wx - labelWidth / 2,
        wy - 8,
        wx + labelWidth / 2,
        wy + 20,
      ]);
    }
  }
  if (compat.truth(armies)) {
    at_position = compat.defaultdict(compat.list);
    for (const __v134 of compat.iter(compat.items(armies))) {
      {
        const __v135 = compat.iter(__v134);
        {
          const __v136 = compat.iter(__v135[0]);
          owner = __v136[0];
          x = __v136[1];
          y = __v136[2];
        }
        units = __v135[1];
      }
      compat.append(compat.get(at_position, [x, y]), [owner, units]);
    }
    city_positions = (() => {
      const __v137: any[] = [];
      for (const __v138 of compat.iter(compat.get(world, "cities"))) {
        let c: any = __v138;
        __v137.push([compat.get(c, "x"), compat.get(c, "y")]);
      }
      return compat.set(__v137);
    })();
    size = compat.get(config, "armyMarkerSize");
    for (const __v139 of compat.iter(
      compat.sorted(
        compat.items(at_position),
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
        const __v140 = compat.iter(__v139);
        {
          const __v141 = compat.iter(__v140[0]);
          tx = __v141[0];
          ty = __v141[1];
        }
        stacks = __v140[1];
      }
      {
        const __v142 = compat.iter(
          center(
            compat.dict([
              ["x", tx],
              ["y", ty],
            ]),
          ),
        );
        cx = __v142[0];
        cy = __v142[1];
      }
      for (const __v143 of compat.iter(compat.enumerate(stacks))) {
        {
          const __v144 = compat.iter(__v143);
          index = __v144[0];
          {
            const __v145 = compat.iter(__v144[1]);
            owner = __v145[0];
            units = __v145[1];
          }
        }
        x = compat.add(
          cx,
          compat.mul(
            compat.sub(index, compat.div(compat.sub(compat.len(stacks), 1), 2)),
            compat.add(compat.mul(size, 2), 3),
          ),
        );
        y = compat.add(
          cy,
          compat.truth(
            compat.and(
              () => compat.has(city_positions, [tx, ty]),
              () => compat.get(config, "showCities"),
            ),
          )
            ? 12
            : 0,
        );
        domains = (() => {
          const __v146: any[] = [];
          for (const __v147 of compat.iter(units)) {
            let u: any = __v147;
            __v146.push(compat.get(u, "domain"));
          }
          return compat.set(__v146);
        })();
        domain = compat.truth(compat.eq(compat.len(domains), 1))
          ? compat.next(compat.iter(domains))
          : "mixed";
        caption = compat.add(
          compat.format(label(compat.get(civs, owner)), "") +
            ": " +
            compat.format(compat.len(units), "") +
            " military unit(s) at (" +
            compat.format(tx, "") +
            "," +
            compat.format(ty, "") +
            ") \u2014 ",
          compat.join(
            ", ",
            compat.sorted(
              (() => {
                const __v148: any[] = [];
                for (const __v149 of compat.iter(units)) {
                  let u: any = __v149;
                  __v148.push(
                    compat.or(
                      () => compat.get(u, "name", null),
                      () => compat.get(u, "type"),
                    ),
                  );
                }
                return __v148;
              })(),
            ),
          ),
        );
        {
          const __v150 = compat.iter(army_symbol(domain));
          icon = __v150[0];
          symbol = __v150[1];
        }
        if (
          compat.truth(compat.eq(compat.get(config, "armyIcons"), "detailed"))
        ) {
          roles = (() => {
            const __v151: any[] = [];
            for (const __v152 of compat.iter(units)) {
              let u: any = __v152;
              __v151.push(military_role(u));
            }
            return compat.set(__v151);
          })();
          icon = compat.truth(compat.eq(compat.len(roles), 1))
            ? compat.next(compat.iter(roles))
            : "generic";
          symbol = compat.or(
            () => detailed_symbol(icon),
            () =>
              compat.get(
                army_symbol(
                  compat.truth(compat.eq(compat.len(roles), 1)) ? domain : null,
                ),
                1,
              ),
          );
        }
        compat.append(
          out,
          '<g class="army-marker" data-owner="' +
            compat.format(owner, "") +
            '" data-x="' +
            compat.format(tx, "") +
            '" data-y="' +
            compat.format(ty, "") +
            '" data-count="' +
            compat.format(compat.len(units), "") +
            '" data-domain="' +
            compat.format(
              compat.escape(domain, compat.dict([["quote", true]])),
              "",
            ) +
            '" data-icon="' +
            compat.format(icon, "") +
            '"><title>' +
            compat.format(compat.escape(caption), "") +
            '</title><circle cx="' +
            compat.format(x, ".2f") +
            '" cy="' +
            compat.format(y, ".2f") +
            '" r="' +
            compat.format(compat.add(size, 1), ".2f") +
            '" fill="#fff8e8" stroke="#242a30" stroke-width="1"/><circle cx="' +
            compat.format(x, ".2f") +
            '" cy="' +
            compat.format(y, ".2f") +
            '" r="' +
            compat.format(compat.sub(size, 1), ".2f") +
            '" fill="none" stroke="' +
            compat.format(compat.get(colors, owner), "") +
            '" stroke-width="2.5"/><g class="army-symbol" transform="translate(' +
            compat.format(x, ".2f") +
            " " +
            compat.format(y, ".2f") +
            ") scale(" +
            compat.format(compat.div(size, 10), ".3f") +
            ')" fill="none" stroke="#242a30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            compat.format(symbol, "") +
            "</g>",
        );
        if (compat.truth(compat.compare(compat.len(units), 1) > 0)) {
          {
            const __v153 = compat.iter([
              compat.add(x, compat.mul(size, 0.8)),
              compat.add(y, compat.mul(size, 0.8)),
            ]);
            bx = __v153[0];
            by = __v153[1];
          }
          count_font = compat.min(
            compat.mul(size, 0.8),
            compat.div(
              compat.mul(size, 1.2),
              compat.len(compat.str(compat.len(units))),
            ),
          );
          compat.append(
            out,
            '<g class="army-stack-count"><circle cx="' +
              compat.format(bx, ".2f") +
              '" cy="' +
              compat.format(by, ".2f") +
              '" r="' +
              compat.format(compat.mul(size, 0.55), ".2f") +
              '" fill="#fff8e8" stroke="#242a30" stroke-width="0.8"/><text x="' +
              compat.format(bx, ".2f") +
              '" y="' +
              compat.format(
                compat.add(by, compat.mul(count_font, 0.35)),
                ".2f",
              ) +
              '" text-anchor="middle" font-size="' +
              compat.format(count_font, ".2f") +
              '" font-weight="bold" style="fill:#242a30;stroke:none">' +
              compat.format(compat.len(units), "") +
              "</text></g>",
          );
        }
        compat.append(out, "</g>");
        extent = compat.add(compat.mul(size, 1.4), 3);
        compat.append(occupied, [
          compat.sub(x, extent),
          compat.sub(y, extent),
          compat.add(x, extent),
          compat.add(y, extent),
        ]);
      }
    }
  }
  if (compat.truth(compat.get(config, "showCities"))) {
    for (const __v154 of compat.iter(compat.get(world, "cities"))) {
      city = __v154;
      {
        const __v155 = compat.iter(center(city));
        x = __v155[0];
        y = __v155[1];
      }
      size = compat.truth(
        compat.and(
          () => compat.get(city, "capital", null) === true,
          () => compat.get(config, "showCapitals"),
        ),
      )
        ? compat.get(config, "capitalSize")
        : 3.2;
      compat.append(occupied, [
        compat.sub(compat.sub(x, size), 2),
        compat.sub(compat.sub(y, size), 2),
        compat.add(compat.add(x, size), 2),
        compat.add(compat.add(y, size), 2),
      ]);
    }
  }
  function intersects(box: any): any {
    return compat.any(
      (() => {
        const __v156: any[] = [];
        for (const __v157 of compat.iter(occupied)) {
          let other: any = __v157;
          __v156.push(
            compat.and(
              () =>
                compat.compare(compat.get(box, 0), compat.get(other, 2)) < 0,
              () =>
                compat.and(
                  () =>
                    compat.compare(compat.get(box, 2), compat.get(other, 0)) >
                    0,
                  () =>
                    compat.and(
                      () =>
                        compat.compare(
                          compat.get(box, 1),
                          compat.get(other, 3),
                        ) < 0,
                      () =>
                        compat.compare(
                          compat.get(box, 3),
                          compat.get(other, 1),
                        ) > 0,
                    ),
                ),
            ),
          );
        }
        return __v156;
      })(),
    );
  }
  if (
    compat.truth(
      compat.and(
        () => !compat.eq(mode, "physical"),
        () => compat.get(config, "showCivilizationNames"),
      ),
    )
  ) {
    for (const __v158 of compat.iter(
      compat.sorted(
        compat.items(territories),
        compat.dict([
          [
            "key",
            (p: any) =>
              compat.truth(compat.get(p, 0) === null) ? -1 : compat.get(p, 0),
          ],
        ]),
      ),
    )) {
      {
        const __v159 = compat.iter(__v158);
        civ_id = __v159[0];
        tiles = __v159[1];
      }
      if (
        compat.truth(
          compat.or(
            () => civ_id === null,
            () =>
              compat.eq(
                compat.get(compat.get(civs, civ_id), "kind", null),
                "city-state",
              ),
          ),
        )
      ) {
        continue;
      }
      tiles = largest_component(
        tiles,
        width,
        compat.get(compat.get(world, "game"), "wrapX"),
      );
      positions = (() => {
        const __v160: any[] = [];
        for (const __v161 of compat.iter(tiles)) {
          let t: any = __v161;
          __v160.push(center(t));
        }
        return __v160;
      })();
      {
        const __v166 = compat.iter(
          (() => {
            const __v162: any[] = [];
            for (const __v163 of compat.iter([0, 1])) {
              let i: any = __v163;
              __v162.push(
                compat.div(
                  compat.sum(
                    (() => {
                      const __v164: any[] = [];
                      for (const __v165 of compat.iter(positions)) {
                        let p: any = __v165;
                        __v164.push(compat.get(p, i));
                      }
                      return __v164;
                    })(),
                  ),
                  compat.len(positions),
                ),
              );
            }
            return __v162;
          })(),
        );
        mx = __v166[0];
        my = __v166[1];
      }
      country_label = label(compat.get(civs, civ_id));
      font = compat.truth(
        !compat.eq(
          compat.get(compat.get(civs, civ_id), "kind", null),
          "city-state",
        ),
      )
        ? compat.get(config, "countryFontSize")
        : compat.add(compat.get(config, "cityFontSize"), 1);
      length = compat.mul(compat.mul(compat.len(country_label), font), 0.58);
      for (const __v167 of compat.iter(
        compat.sorted(
          positions,
          compat.dict([
            [
              "key",
              (p: any) => [
                compat.add(
                  compat.pow(compat.sub(compat.get(p, 0), mx), 2),
                  compat.pow(compat.sub(compat.get(p, 1), my), 2),
                ),
                compat.get(p, 1),
                compat.get(p, 0),
              ],
            ],
          ]),
        ),
      )) {
        {
          const __v168 = compat.iter(__v167);
          x = __v168[0];
          y = __v168[1];
        }
        box = [
          compat.sub(x, compat.div(length, 2)),
          compat.sub(compat.sub(y, 10), font),
          compat.add(x, compat.div(length, 2)),
          compat.sub(y, 8),
        ];
        if (
          compat.truth(
            compat.and(
              () => compat.compare(compat.get(box, 0), 0) >= 0,
              () =>
                compat.and(
                  () => compat.compare(compat.get(box, 2), vw) <= 0,
                  () => !compat.truth(intersects(box)),
                ),
            ),
          )
        ) {
          compat.append(occupied, box);
          owner_attr = compat.truth(interactive)
            ? ' data-owner="' + compat.format(civ_id, "") + '"'
            : "";
          compat.append(
            out,
            '<text class="country"' +
              compat.format(owner_attr, "") +
              ' x="' +
              compat.format(x, ".2f") +
              '" y="' +
              compat.format(compat.sub(y, 10), ".2f") +
              '" text-anchor="middle" font-size="' +
              compat.format(font, "") +
              '">' +
              compat.format(compat.escape(country_label), "") +
              "</text>",
          );
          break;
        }
      }
    }
  }
  if (compat.truth(compat.get(config, "showCities"))) {
    for (const __v169 of compat.iter(
      compat.sorted(
        compat.get(world, "cities"),
        compat.dict([
          [
            "key",
            (c: any) => [
              -compat.int(compat.get(c, "capital", null) === true),
              -compat.get(c, "population", 0),
              compat.get(c, "y"),
              compat.get(c, "x"),
              compat.get(c, "name"),
            ],
          ],
        ]),
      ),
    )) {
      city = __v169;
      {
        const __v170 = compat.iter(center(city));
        x = __v170[0];
        y = __v170[1];
      }
      capital = compat.and(
        () => compat.get(city, "capital", null) === true,
        () => compat.get(config, "showCapitals"),
      );
      city_attrs = compat.truth(interactive)
        ? ' data-city-id="' +
          compat.format(
            compat.escape(
              compat.str(compat.get(city, "id")),
              compat.dict([["quote", true]]),
            ),
            "",
          ) +
          '" data-owner="' +
          compat.format(compat.get(city, "owner"), "") +
          '" data-x="' +
          compat.format(compat.get(city, "x"), "") +
          '" data-y="' +
          compat.format(compat.get(city, "y"), "") +
          '"'
        : "";
      marker_size = compat.truth(capital)
        ? compat.get(config, "capitalSize")
        : 3.2;
      if (mode === "religion") {
        compat.append(
          out,
          religionMarker(religionWorld, compat.unwrap(city), x, y, city_attrs),
        );
      } else if (compat.truth(capital)) {
        minor = compat.eq(
          compat.get(compat.get(civs, compat.get(city, "owner")), "kind", null),
          "city-state",
        );
        points = [];
        for (const __v171 of compat.iter(compat.range(10))) {
          i = __v171;
          angle = compat.add(
            compat.div(-Math.PI, 2),
            compat.div(compat.mul(i, Math.PI), 5),
          );
          point_radius = compat.mul(
            marker_size,
            compat.truth(compat.eq(compat.mod(i, 2), 0)) ? 0.78 : 0.34,
          );
          compat.append(
            points,
            compat.format(
              compat.add(x, compat.mul(point_radius, Math.cos(angle))),
              ".2f",
            ) +
              "," +
              compat.format(
                compat.add(y, compat.mul(point_radius, Math.sin(angle))),
                ".2f",
              ),
          );
        }
        if (compat.truth(minor)) {
          badge =
            '<polygon class="city-state-capital" points="' +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.sub(y, marker_size), ".2f") +
            " " +
            compat.format(compat.add(x, marker_size), ".2f") +
            "," +
            compat.format(y, ".2f") +
            " " +
            compat.format(x, ".2f") +
            "," +
            compat.format(compat.add(y, marker_size), ".2f") +
            " " +
            compat.format(compat.sub(x, marker_size), ".2f") +
            "," +
            compat.format(y, ".2f") +
            '" fill="#71558f" stroke="#f4e9ce" stroke-width="1.3"/>';
        } else {
          badge =
            '<circle class="empire-capital" cx="' +
            compat.format(x, ".2f") +
            '" cy="' +
            compat.format(y, ".2f") +
            '" r="' +
            compat.format(marker_size, "") +
            '" fill="#fff8e8" stroke="#3c3025" stroke-width="1.3"/>';
        }
        star_fill = compat.truth(minor) ? "#f1e7fa" : "#c99734";
        capital_position = compat.truth(interactive)
          ? ""
          : ' data-x="' +
            compat.format(compat.get(city, "x"), "") +
            '" data-y="' +
            compat.format(compat.get(city, "y"), "") +
            '"';
        compat.append(
          out,
          compat.add(
            compat.add(
              '<g class="capital-marker"' +
                compat.format(city_attrs, "") +
                ' data-kind="' +
                compat.format(
                  compat.truth(minor) ? "city-state" : "empire",
                  "",
                ) +
                '"' +
                compat.format(capital_position, "") +
                "><title>" +
                compat.format(compat.escape(compat.get(city, "name")), "") +
                " \u2014 current " +
                compat.format(compat.truth(minor) ? "city-state " : "", "") +
                "capital</title>",
              badge,
            ),
            '<polygon points="' +
              compat.format(compat.join(" ", points), "") +
              '" fill="' +
              compat.format(star_fill, "") +
              '" stroke="' +
              compat.format(compat.truth(minor) ? "#49365d" : "#3c3025", "") +
              '" stroke-width="0.9"/></g>',
          ),
        );
      } else {
        compat.append(
          out,
          '<circle class="city-marker"' +
            compat.format(city_attrs, "") +
            ' cx="' +
            compat.format(x, ".2f") +
            '" cy="' +
            compat.format(y, ".2f") +
            '" r="3.2" fill="#292a28" stroke="#f4e9ce" stroke-width="1.1"><title>' +
            compat.format(compat.escape(compat.get(city, "name")), "") +
            "</title></circle>",
        );
      }
      font = compat.get(config, "cityFontSize");
      length = compat.mul(
        compat.mul(compat.len(compat.get(city, "name")), font),
        0.58,
      );
      gap = compat.truth(capital) ? compat.add(marker_size, 4) : 9;
      for (const __v172 of compat.iter([
        [gap, 4],
        [compat.sub(-length, gap), 4],
        [gap, -8],
        [compat.sub(-length, gap), -8],
        [gap, 17],
        [compat.sub(-length, gap), 17],
      ])) {
        {
          const __v173 = compat.iter(__v172);
          dx = __v173[0];
          dy = __v173[1];
        }
        box = [
          compat.sub(compat.add(x, dx), 2),
          compat.sub(compat.sub(compat.add(y, dy), font), 2),
          compat.add(compat.add(compat.add(x, dx), length), 2),
          compat.add(compat.add(y, dy), 3),
        ];
        if (
          compat.truth(
            compat.and(
              () => compat.compare(compat.get(box, 0), 0) >= 0,
              () =>
                compat.and(
                  () => compat.compare(compat.get(box, 2), vw) <= 0,
                  () =>
                    compat.and(
                      () => compat.compare(compat.get(box, 1), 0) >= 0,
                      () =>
                        compat.and(
                          () => compat.compare(compat.get(box, 3), vh) <= 0,
                          () => !compat.truth(intersects(box)),
                        ),
                    ),
                ),
            ),
          )
        ) {
          compat.append(occupied, box);
          weight = compat.truth(capital) ? ' font-weight="bold"' : "";
          minor_style = compat.truth(
            compat.eq(
              compat.get(
                compat.get(civs, compat.get(city, "owner")),
                "kind",
                null,
              ),
              "city-state",
            ),
          )
            ? ' class="city-state-label"'
            : ' class="city-label"';
          compat.append(
            out,
            "<text" +
              compat.format(city_attrs, "") +
              ' x="' +
              compat.format(compat.add(x, dx), ".2f") +
              '" y="' +
              compat.format(compat.add(y, dy), ".2f") +
              '" font-size="' +
              compat.format(font, "") +
              '"' +
              compat.format(weight, "") +
              compat.format(minor_style, "") +
              ">" +
              compat.format(compat.escape(compat.get(city, "name")), "") +
              "</text>",
          );
          break;
        }
      }
    }
  }
  if (compat.truth(caption_lines !== null)) {
    compat.extend(
      out,
      caption_footer(
        caption_lines,
        vw,
        vh,
        config,
        compat.get(compat.get(world, "game"), "turn", "?"),
      ),
    );
  }
  if (compat.truth(compat.get(config, "showMilitarySummary"))) {
    panel_width = compat.max(vw, 480);
    {
      const __v174 = compat.iter(
        military_summary_panel(
          military_summary(compat.get(world, "civilizations"), armies),
          civs,
          colors,
          label,
          panel_width,
          canvas_height,
        ),
      );
      panel_height = __v174[0];
      panel = __v174[1];
    }
    canvas_height = compat.add(canvas_height, panel_height);
    compat.put(
      out,
      0,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
        compat.format(panel_width, ".2f") +
        " " +
        compat.format(canvas_height, ".2f") +
        '">',
    );
    compat.extend(out, panel);
  }
  compat.append(out, "</svg>");
  return compat.add(compat.join("\n", out), "\n");
}
