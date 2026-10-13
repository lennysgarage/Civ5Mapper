// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { MAX_INPUT, ParseError, Reader } from "./save.js";
import { dimensions } from "./replay.js";
import { validate_world } from "./render.js";
/** Civ5Map v11/12 and upstream JSON adapter (MIT layout adaptation; NOTICE).

Map owner encoding (major 0..31, minor 32..95) is distinct from save slots
and replay indexes. Free allocator slots never become active cities/units.
 */

export function cstring(data: any): any {
  try {
    return compat.decode(
      compat.get(compat.split(data, compat.bytes([0]), 1), 0),
      "utf-8",
    );
  } catch (__v1) {
    if (__v1 instanceof compat.ParseError) {
      let exc = __v1;
      throw new compat.ParseError("invalid map UTF-8");
    } else {
      throw __v1;
    }
  }
}
export function string_table(data: any): any {
  if (compat.truth(!compat.truth(data))) {
    return [];
  }
  if (compat.truth(!compat.eq(compat.get(data, -1), 0))) {
    throw new compat.ParseError("unterminated map string table");
  }
  return (() => {
    const __v2: any[] = [];
    for (const __v3 of compat.iter(
      compat.split(compat.slice(data, null, -1, null), compat.bytes([0])),
    )) {
      let s: any = __v3;
      __v2.push(cstring(s));
    }
    return __v2;
  })();
}
export function allocator(data: any, size: any, link_size: any = 4): any {
  let free: any, head: any, records: any;
  if (compat.truth(!compat.truth(data))) {
    return [[], compat.set()];
  }
  if (
    compat.truth(
      compat.or(
        () => compat.compare(compat.len(data), 4) < 0,
        () => compat.mod(compat.sub(compat.len(data), 4), size),
      ),
    )
  ) {
    throw new compat.ParseError("misaligned map free-list array");
  }
  head = compat.get(compat.struct.unpack_from("<i", data), 0);
  records = (() => {
    const __v4: any[] = [];
    for (const __v5 of compat.iter(compat.range(4, compat.len(data), size))) {
      let i: any = __v5;
      __v4.push(compat.slice(data, i, compat.add(i, size), null));
    }
    return __v4;
  })();
  free = compat.set();
  while (compat.truth(!compat.eq(head, -1))) {
    if (
      compat.truth(
        compat.or(
          () => compat.compare(head, 0) < 0,
          () =>
            compat.or(
              () => compat.compare(head, compat.len(records)) >= 0,
              () => compat.has(free, head),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid or cyclic map free-list");
    }
    compat.add(free, head);
    head = compat.get(
      compat.struct.unpack_from(
        compat.truth(compat.eq(link_size, 2)) ? "<h" : "<i",
        compat.get(records, head),
      ),
      0,
    );
  }
  return [records, free];
}
export function geography(
  tiles: any,
  terrain_names: any,
  features: any,
  wonders: any = null,
): any {
  let elevation: any,
    feature: any,
    fi: any,
    index: any,
    output: any,
    t: any,
    terrain: any,
    water: any,
    wi: any;
  output = [];
  for (const __v6 of compat.iter(tiles)) {
    t = __v6;
    index = compat.get(t, "terrainId");
    if (
      compat.truth(
        !compat.truth(
          compat.compare(0, index) <= 0 &&
            compat.compare(index, compat.len(terrain_names)) < 0,
        ),
      )
    ) {
      throw new compat.ParseError("invalid map terrain index");
    }
    terrain = compat.get(terrain_names, index);
    elevation = compat.get(t, "mapElevation");
    if (compat.truth(!compat.has([0, 1, 2], elevation))) {
      throw new compat.ParseError("invalid map elevation");
    }
    water = compat.has(["TERRAIN_COAST", "TERRAIN_OCEAN"], terrain);
    feature = null;
    fi = compat.get(t, "featureId", null);
    if (compat.truth(fi !== null)) {
      if (
        compat.truth(
          !compat.truth(
            compat.compare(0, fi) <= 0 &&
              compat.compare(fi, compat.len(features)) < 0,
          ),
        )
      ) {
        throw new compat.ParseError("invalid map feature index");
      }
      feature = compat.get(features, fi);
    }
    wi = compat.get(t, "wonderId", null);
    if (
      compat.truth(
        compat.and(
          () => wi !== null,
          () => wonders !== null,
        ),
      )
    ) {
      if (
        compat.truth(
          !compat.truth(
            compat.compare(0, wi) <= 0 &&
              compat.compare(wi, compat.len(wonders)) < 0,
          ),
        )
      ) {
        throw new compat.ParseError("invalid map wonder index");
      }
      feature = compat.get(wonders, wi);
    }
    compat.append(
      output,
      compat.dict([
        ["x", compat.get(t, "x")],
        ["y", compat.get(t, "y")],
        ["terrainId", index],
        ["terrain", terrain],
        ["feature", feature],
        ["landWater", compat.truth(water) ? "water" : "land"],
        ["elevation", compat.get(["flat", "hills", "mountain"], elevation)],
        ["owner", null],
        ["ownershipKnown", true],
        ["isLake", null],
        ["riverEdges", compat.get(t, "riverEdges")],
      ]),
    );
  }
  return output;
}
export function base_world(
  width: any,
  height: any,
  wrap: any,
  tiles: any,
  source: any,
  civs: any = null,
  cities: any = null,
  turn: any = 0,
): any {
  return compat.dict([
    ["schemaVersion", "0.1"],
    ["source", source],
    [
      "extraction",
      compat.dict([
        ["status", "complete"],
        ["warnings", []],
        [
          "fields",
          compat.dict([
            ["tileGeography", "extracted"],
            ["tileOwnership", "extracted"],
            ["cities", "extracted"],
          ]),
        ],
      ]),
    ],
    [
      "game",
      compat.dict([
        ["width", width],
        ["height", height],
        ["wrapX", wrap],
        ["wrapY", false],
        ["coordinates", "odd-r-bottom-up"],
        ["turn", turn],
      ]),
    ],
    ["tiles", tiles],
    [
      "civilizations",
      compat.or(
        () => civs,
        () => [],
      ),
    ],
    [
      "cities",
      compat.or(
        () => cities,
        () => [],
      ),
    ],
  ]);
}
export function parse_map(data: any): any {
  let amount: any,
    c: any,
    chain: any,
    cities: any,
    city: any,
    city_free: any,
    city_records: any,
    civs: any,
    co: any,
    color: any,
    cont: any,
    cr: any,
    description: any,
    display: any,
    el: any,
    era: any,
    feat: any,
    features: any,
    flag: any,
    flags: any,
    handicap: any,
    height: any,
    i: any,
    ids: any,
    improvement: any,
    key: any,
    leader: any,
    major: any,
    maxturn: any,
    minor: any,
    n: any,
    name: any,
    name_free: any,
    next_unit: any,
    ni: any,
    owner: any,
    pop: any,
    r: any,
    record: any,
    res: any,
    resources: any,
    riv: any,
    route: any,
    route_owner: any,
    score: any,
    section_sizes: any,
    seen_city: any,
    seen_unit: any,
    settings: any,
    sizes: any,
    speed: any,
    start: any,
    tables: any,
    team_names: any,
    teams: any,
    terrain: any,
    tile: any,
    tiles: any,
    tr: any,
    u: any,
    unit: any,
    unit_free: any,
    unit_names: any,
    units: any,
    unused: any,
    version: any,
    width: any,
    won: any,
    wonders: any,
    world: any,
    world_size: any,
    year: any;
  if (compat.truth(compat.compare(compat.len(data), MAX_INPUT) > 0)) {
    throw new compat.ParseError("map input size limit exceeded");
  }
  r = new Reader(data);
  flag = r.unpack("B");
  version = compat.bitAnd(flag, 15);
  if (compat.truth(!compat.has([11, 12], version))) {
    throw new compat.ParseError(
      "unsupported Civ5Map version " +
        compat.format(version, "") +
        "; requires 11/12",
    );
  }
  {
    const __v7 = compat.iter([r.unpack("I"), r.unpack("I")]);
    width = __v7[0];
    height = __v7[1];
  }
  dimensions(width, height);
  r.take(1);
  settings = r.take(4);
  sizes = (() => {
    const __v8: any[] = [];
    for (const __v9 of compat.iter(compat.range(7))) {
      let _: any = __v9;
      __v8.push(r.count(MAX_INPUT));
    }
    return __v8;
  })();
  {
    const __v12 = compat.iter(
      (() => {
        const __v10: any[] = [];
        for (const __v11 of compat.iter(compat.slice(sizes, null, 4, null))) {
          let n: any = __v11;
          __v10.push(string_table(r.take(n)));
        }
        return __v10;
      })(),
    );
    terrain = __v12[0];
    features = __v12[1];
    wonders = __v12[2];
    resources = __v12[3];
  }
  r.take(compat.get(sizes, 4));
  name = cstring(r.take(compat.get(sizes, 5)));
  description = cstring(r.take(compat.get(sizes, 6)));
  world_size = cstring(r.take(r.count(1000000)));
  tiles = [];
  for (const __v13 of compat.iter(compat.range(compat.mul(width, height)))) {
    i = __v13;
    {
      const __v14 = compat.iter(r.take(8));
      tr = __v14[0];
      res = __v14[1];
      feat = __v14[2];
      riv = __v14[3];
      el = __v14[4];
      cont = __v14[5];
      won = __v14[6];
      amount = __v14[7];
    }
    if (
      compat.truth(
        compat.and(
          () => !compat.eq(res, 255),
          () => compat.compare(res, compat.len(resources)) >= 0,
        ),
      )
    ) {
      throw new compat.ParseError("invalid map resource index");
    }
    compat.append(
      tiles,
      compat.dict([
        ["x", compat.mod(i, width)],
        ["y", compat.floorDiv(i, width)],
        ["terrainId", tr],
        ["featureId", compat.truth(compat.eq(feat, 255)) ? null : feat],
        ["wonderId", compat.truth(compat.eq(won, 255)) ? null : won],
        ["mapElevation", el],
        [
          "riverEdges",
          (() => {
            const __v15: any[] = [];
            for (const __v16 of compat.iter([
              [1, "E"],
              [2, "SE"],
              [4, "SW"],
            ])) {
              let [b, e] = compat.iter(__v16);
              if (!compat.truth(compat.bitAnd(riv, b))) continue;
              __v15.push(e);
            }
            return __v15;
          })(),
        ],
      ]),
    );
  }
  tiles = geography(tiles, terrain, features, wonders);
  world = base_world(
    width,
    height,
    compat.bool(compat.bitAnd(compat.get(settings, 0), 1)),
    tiles,
    compat.dict([
      ["kind", "map"],
      ["sha256", compat.hexdigest(compat.sha256(data))],
    ]),
  );
  compat.put(
    world,
    "inspection",
    compat.dict([
      ["mapVersion", version],
      ["scenario", compat.shiftRight(flag, 4)],
      ["mapName", name],
      ["description", description],
      ["worldSize", world_size],
    ]),
  );
  if (compat.truth(compat.eq(r.pos, compat.len(data)))) {
    compat.put(compat.get(world, "inspection"), "gameDataPresent", false);
    return world;
  }
  speed = cstring(r.take(64));
  {
    const __v19 = compat.iter(
      (() => {
        const __v17: any[] = [];
        for (const __v18 of compat.iter(compat.range(4))) {
          let _: any = __v18;
          __v17.push(r.unpack("i"));
        }
        return __v17;
      })(),
    );
    start = __v19[0];
    maxturn = __v19[1];
    score = __v19[2];
    year = __v19[3];
  }
  {
    const __v20 = compat.iter(r.take(4));
    major = __v20[0];
    minor = __v20[1];
    teams = __v20[2];
    unused = __v20[3];
  }
  if (
    compat.truth(
      compat.or(
        () => compat.compare(major, 32) > 0,
        () =>
          compat.or(
            () => compat.compare(minor, 64) > 0,
            () => compat.compare(teams, 96) > 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid map scenario player counts");
  }
  section_sizes = (() => {
    const __v21: any[] = [];
    for (const __v22 of compat.iter(compat.range(11))) {
      let _: any = __v22;
      __v21.push(r.count(MAX_INPUT));
    }
    return __v21;
  })();
  tables = compat.dict([]);
  for (const __v23 of compat.iter(
    compat.zip(
      ["improvements", "units", "techs", "policies", "buildings", "promotions"],
      compat.slice(section_sizes, null, 6, null),
    ),
  )) {
    {
      const __v24 = compat.iter(__v23);
      key = __v24[0];
      n = __v24[1];
    }
    compat.put(tables, key, string_table(r.take(n)));
  }
  {
    const __v25 = compat.iter(
      allocator(
        r.take(compat.get(section_sizes, 6)),
        compat.truth(compat.eq(version, 11)) ? 48 : 84,
        2,
      ),
    );
    units = __v25[0];
    unit_free = __v25[1];
  }
  {
    const __v26 = compat.iter(
      allocator(r.take(compat.get(section_sizes, 7)), 64),
    );
    unit_names = __v26[0];
    name_free = __v26[1];
  }
  {
    const __v27 = compat.iter(
      allocator(
        r.take(compat.get(section_sizes, 8)),
        compat.truth(compat.eq(version, 11)) ? 104 : 136,
      ),
    );
    city_records = __v27[0];
    city_free = __v27[1];
  }
  compat.put(
    tables,
    "victories",
    string_table(r.take(compat.get(section_sizes, 9))),
  );
  compat.put(
    tables,
    "options",
    string_table(r.take(compat.get(section_sizes, 10))),
  );
  r.take(
    compat.add(
      compat.add(
        compat.mul(
          5,
          compat.floorDiv(
            compat.add(
              compat.floorDiv(compat.mul(teams, compat.sub(teams, 1)), 2),
              7,
            ),
            8,
          ),
        ),
        compat.mul(compat.mul(major, 64), 4),
      ),
      compat.floorDiv(
        compat.add(compat.mul(compat.mul(width, height), teams), 7),
        8,
      ),
    ),
  );
  team_names = (() => {
    const __v28: any[] = [];
    for (const __v29 of compat.iter(compat.range(teams))) {
      let _: any = __v29;
      __v28.push(cstring(r.take(64)));
    }
    return __v28;
  })();
  civs = [];
  for (const __v30 of compat.iter(compat.range(compat.add(major, minor)))) {
    i = __v30;
    record = r.take(436);
    c = new Reader(record, 32);
    {
      const __v33 = compat.iter(
        (() => {
          const __v31: any[] = [];
          for (const __v32 of compat.iter(compat.range(6))) {
            let _: any = __v32;
            __v31.push(cstring(c.take(64)));
          }
          return __v31;
        })(),
      );
      leader = __v33[0];
      display = __v33[1];
      key = __v33[2];
      color = __v33[3];
      era = __v33[4];
      handicap = __v33[5];
    }
    compat.append(
      civs,
      compat.dict([
        [
          "id",
          compat.truth(compat.compare(i, major) < 0)
            ? i
            : compat.sub(compat.add(32, i), major),
        ],
        [
          "name",
          compat.or(
            () => display,
            () => key,
          ),
        ],
        ["key", key],
        [
          "kind",
          compat.truth(compat.compare(i, major) < 0) ? "major" : "city-state",
        ],
        ["leader", leader],
        ["colorKey", color],
        ["color", null],
      ]),
    );
  }
  ids = (() => {
    const __v34: any[] = [];
    for (const __v35 of compat.iter(civs)) {
      let c: any = __v35;
      __v34.push(compat.get(c, "id"));
    }
    return compat.set(__v34);
  })();
  cities = [];
  seen_city = compat.set();
  seen_unit = compat.set();
  for (const __v36 of compat.iter(tiles)) {
    tile = __v36;
    {
      const __v37 = compat.iter([r.unpack("H"), r.unpack("H")]);
      city = __v37[0];
      unit = __v37[1];
    }
    {
      const __v38 = compat.iter(r.take(4));
      owner = __v38[0];
      improvement = __v38[1];
      route = __v38[2];
      route_owner = __v38[3];
    }
    if (
      compat.truth(
        compat.and(
          () => !compat.eq(owner, 255),
          () => !compat.has(ids, owner),
        ),
      )
    ) {
      throw new compat.ParseError("unknown scenario tile owner");
    }
    if (
      compat.truth(
        compat.and(
          () => !compat.eq(improvement, 255),
          () =>
            compat.compare(
              improvement,
              compat.len(compat.get(tables, "improvements")),
            ) >= 0,
        ),
      )
    ) {
      throw new compat.ParseError("invalid map improvement");
    }
    if (compat.truth(!compat.has([0, 1, 255], route))) {
      throw new compat.ParseError("invalid map route");
    }
    compat.update(
      tile,
      compat.dict([
        ["owner", compat.truth(compat.eq(owner, 255)) ? null : owner],
        ["routeKnown", true],
        ["routeId", compat.truth(compat.eq(route, 255)) ? null : route],
        [
          "route",
          compat.truth(compat.eq(route, 255))
            ? null
            : compat.get(["ROUTE_ROAD", "ROUTE_RAILROAD"], route),
        ],
        ["routePillaged", false],
      ]),
    );
    if (compat.truth(!compat.eq(city, 65535))) {
      if (
        compat.truth(
          compat.or(
            () => compat.compare(city, compat.len(city_records)) >= 0,
            () =>
              compat.or(
                () => compat.has(city_free, city),
                () => compat.has(seen_city, city),
              ),
          ),
        )
      ) {
        throw new compat.ParseError(
          "map tile references missing/freed/duplicate city",
        );
      }
      compat.add(seen_city, city);
      record = compat.get(city_records, city);
      cr = new Reader(record, 64);
      {
        const __v39 = compat.iter([
          cr.unpack("B"),
          cr.unpack("B"),
          cr.unpack("H"),
        ]);
        co = __v39[0];
        flags = __v39[1];
        pop = __v39[2];
      }
      if (
        compat.truth(
          compat.or(
            () => !compat.eq(co, owner),
            () => !compat.eq(compat.get(tile, "landWater"), "land"),
          ),
        )
      ) {
        throw new compat.ParseError("scenario city owner/geography mismatch");
      }
      compat.append(
        cities,
        compat.dict([
          ["id", "map:" + compat.format(city, "")],
          ["name", cstring(compat.slice(record, null, 64, null))],
          ["owner", owner],
          ["x", compat.get(tile, "x")],
          ["y", compat.get(tile, "y")],
          ["population", pop],
          ["capital", null],
        ]),
      );
    }
    chain = compat.set();
    while (compat.truth(!compat.eq(unit, 65535))) {
      if (
        compat.truth(
          compat.or(
            () => compat.compare(unit, compat.len(units)) >= 0,
            () =>
              compat.or(
                () => compat.has(unit_free, unit),
                () =>
                  compat.or(
                    () => compat.has(chain, unit),
                    () => compat.has(seen_unit, unit),
                  ),
              ),
          ),
        )
      ) {
        throw new compat.ParseError("invalid map unit reference/stack");
      }
      compat.add(chain, unit);
      compat.add(seen_unit, unit);
      u = new Reader(compat.get(units, unit));
      next_unit = u.unpack("H");
      ni = u.unpack("H");
      if (
        compat.truth(
          compat.and(
            () => !compat.eq(ni, 65535),
            () =>
              compat.or(
                () => compat.compare(ni, compat.len(unit_names)) >= 0,
                () => compat.has(name_free, ni),
              ),
          ),
        )
      ) {
        throw new compat.ParseError("invalid map unit name reference");
      }
      unit = next_unit;
    }
  }
  if (compat.truth(!compat.eq(r.pos, compat.len(data)))) {
    throw new compat.ParseError("unparsed map scenario trailing bytes");
  }
  compat.update(
    world,
    compat.dict([
      ["civilizations", civs],
      ["cities", cities],
    ]),
  );
  compat.put(compat.get(world, "game"), "turn", start);
  compat.update(
    compat.get(world, "inspection"),
    compat.dict([
      ["gameDataPresent", true],
      ["unitCapacity", compat.len(units)],
      ["freeUnits", compat.sorted(unit_free)],
      ["cityCapacity", compat.len(city_records)],
      ["freeCities", compat.sorted(city_free)],
      ["teamNames", team_names],
    ]),
  );
  validate_world(world);
  return world;
}
export function upstream_map(document: any): any {
  let c: any,
    civs: any,
    h: any,
    height: any,
    imp: any,
    improvements: any,
    index: any,
    m: any,
    owner: any,
    owner_by_index: any,
    raw: any,
    row: any,
    rows: any,
    t: any,
    tiles: any,
    w: any,
    world: any,
    x: any,
    y: any;
  /** Read legacy scenario JSON without reassigning scenario owners. */
  m = compat.get(document, "MapData");
  h = compat.get(m, "MapHeader");
  {
    const __v40 = compat.iter([
      compat.get(h, "Width"),
      compat.get(h, "Height"),
    ]);
    w = __v40[0];
    height = __v40[1];
  }
  dimensions(w, height);
  rows = compat.get(m, "MapTiles");
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(compat.len(rows), height),
        () =>
          compat.any(
            (() => {
              const __v41: any[] = [];
              for (const __v42 of compat.iter(rows)) {
                let row: any = __v42;
                __v41.push(!compat.eq(compat.len(row), w));
              }
              return __v41;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("upstream JSON geography dimensions mismatch");
  }
  raw = [];
  for (const __v43 of compat.iter(compat.enumerate(rows))) {
    {
      const __v44 = compat.iter(__v43);
      y = __v44[0];
      row = __v44[1];
    }
    for (const __v45 of compat.iter(compat.enumerate(row))) {
      {
        const __v46 = compat.iter(__v45);
        x = __v46[0];
        t = __v46[1];
      }
      compat.append(
        raw,
        compat.dict([
          ["x", x],
          ["y", y],
          ["terrainId", compat.get(t, "TerrainType")],
          ["mapElevation", compat.get(t, "Elevation")],
          [
            "featureId",
            compat.truth(
              compat.has([-1, 255], compat.get(t, "FeatureTerrainType")),
            )
              ? null
              : compat.get(t, "FeatureTerrainType"),
          ],
          [
            "riverEdges",
            (() => {
              const __v47: any[] = [];
              for (const __v48 of compat.iter([
                [1, "E"],
                [2, "SE"],
                [4, "SW"],
              ])) {
                let [b, e] = compat.iter(__v48);
                if (!compat.truth(compat.bitAnd(compat.get(t, "RiverData"), b)))
                  continue;
                __v47.push(e);
              }
              return __v47;
            })(),
          ],
        ]),
      );
    }
  }
  tiles = geography(
    raw,
    compat.get(m, "TerrainList"),
    compat.get(m, "FeatureTerrainList"),
  );
  world = base_world(
    w,
    height,
    compat.bool(compat.bitAnd(compat.get(compat.get(h, "Settings"), 0), 1)),
    tiles,
    compat.dict([
      ["kind", "map"],
      ["format", "scenario-json"],
    ]),
  );
  civs = [];
  owner_by_index = (() => {
    const __v49: any[] = [];
    for (const __v50 of compat.iter(
      compat.items(compat.get(m, "CityOwnerIndexMap", compat.dict([]))),
    )) {
      let [owner, index] = compat.iter(__v50);
      __v49.push([index, compat.int(owner)]);
    }
    return compat.dict(__v49);
  })();
  for (const __v51 of compat.iter(compat.get(m, "Civ5PlayerData", []))) {
    c = __v51;
    index = compat.get(c, "Index");
    owner = compat.get(owner_by_index, index, index);
    compat.append(
      civs,
      compat.dict([
        ["id", owner],
        ["key", compat.get(c, "CivType")],
        [
          "name",
          compat.or(
            () => compat.get(c, "CivName", null),
            () => compat.get(c, "CivType"),
          ),
        ],
        ["colorKey", compat.get(c, "TeamColor")],
        ["color", null],
        [
          "kind",
          compat.truth(compat.compare(owner, 32) < 0) ? "major" : "city-state",
        ],
      ]),
    );
  }
  compat.put(world, "civilizations", civs);
  improvements = compat.get(m, "MapTileImprovements", []);
  if (compat.truth(improvements)) {
    if (
      compat.truth(
        compat.or(
          () => !compat.eq(compat.len(improvements), height),
          () =>
            compat.any(
              (() => {
                const __v52: any[] = [];
                for (const __v53 of compat.iter(improvements)) {
                  let row: any = __v53;
                  __v52.push(!compat.eq(compat.len(row), w));
                }
                return __v52;
              })(),
            ),
        ),
      )
    ) {
      throw new compat.ParseError(
        "upstream JSON improvement dimensions mismatch",
      );
    }
    for (const __v54 of compat.iter(
      compat.zip(
        tiles,
        (() => {
          const __v55: any[] = [];
          for (const __v56 of compat.iter(improvements)) {
            let row: any = __v56;
            for (const __v57 of compat.iter(row)) {
              let t: any = __v57;
              __v55.push(t);
            }
          }
          return __v55;
        })(),
      ),
    )) {
      {
        const __v58 = compat.iter(__v54);
        t = __v58[0];
        imp = __v58[1];
      }
      owner = compat.get(imp, "Owner");
      compat.put(
        t,
        "owner",
        compat.truth(compat.has([-1, 255, 65535, 4294967295], owner))
          ? null
          : owner,
      );
      if (compat.truth(!compat.eq(compat.get(imp, "CityId", -1), -1))) {
        compat.append(
          compat.get(world, "cities"),
          compat.dict([
            ["id", "map:" + compat.format(compat.get(imp, "CityId"), "")],
            [
              "name",
              compat.or(
                () => compat.get(imp, "CityName", null),
                () => "",
              ),
            ],
            ["owner", compat.get(t, "owner")],
            ["x", compat.get(t, "x")],
            ["y", compat.get(t, "y")],
            ["capital", null],
          ]),
        );
      }
    }
  }
  validate_world(world);
  return world;
}
