import { extractCulture } from "./culture.js";
// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { ParseError, Reader, inspect_bytes } from "./save.js";
import { add_alliances } from "./diplomacy.js";
import { add_capitals } from "./capitals.js";
import {
  extractCityReligions,
  extractReligionCatalog,
} from "./religion_extract.js";
import { extract_units } from "./units.js";
export let FEATURE_HASHES: any, FEATURE_KEYS: any, PROFILES: any;
/** Current-state extraction with validated, explicitly limited layout profiles.

Vanilla layout follows SDK serialization evidence. The seven- and eight-yield
profiles are empirical, validated against local saves; they are not a general
custom DLL decoder. Unnamed fields are skipped, never given invented meanings.
 */

PROFILES = compat.dict([
  [
    "bnw-six-yield",
    compat.dict([
      ["ownerOffset", 55],
      ["routePillageOffset", 50],
      ["yields", 6],
      ["cityScalars", 66],
      ["cityOwnerPadding", 4],
      ["cityYieldVectors", 16],
      ["cityNamePadding", 0],
    ]),
  ],
  [
    "observed-seven-yield",
    compat.dict([
      ["ownerOffset", 57],
      ["routePillageOffset", 50],
      ["yields", 7],
      ["cityScalars", 58],
      ["cityOwnerPadding", 0],
      ["cityYieldVectors", 18],
      ["cityNamePadding", 5],
    ]),
  ],
  [
    "observed-eight-yield",
    compat.dict([
      ["ownerOffset", 58],
      ["routePillageOffset", 50],
      ["yields", 8],
      ["cityScalars", 60],
      ["cityOwnerPadding", 0],
      ["cityYieldVectors", 18],
      ["cityNamePadding", 5],
      ["gameHeaderPadding", 4],
    ]),
  ],
]);
FEATURE_KEYS = [
  "FEATURE_ICE",
  "FEATURE_FOREST",
  "FEATURE_JUNGLE",
  "FEATURE_MARSH",
  "FEATURE_OASIS",
  "FEATURE_FLOOD_PLAINS",
  "FEATURE_FALLOUT",
];
FEATURE_HASHES = (() => {
  const __v1: any[] = [];
  for (const __v2 of compat.iter(FEATURE_KEYS)) {
    let key: any = __v2;
    __v1.push([
      compat.bitXor(compat.crc32(compat.encode(key)), 4294967295),
      key,
    ]);
  }
  return compat.dict(__v1);
})();
export function read_plot(r: any, profile: any): any {
  let _: any,
    arch: any,
    builds: any,
    city_id: any,
    city_owner: any,
    construction: any,
    entries: any,
    feature: any,
    flows: any,
    improvement: any,
    owner: any,
    pillaged: any,
    plot: any,
    resource: any,
    revealed: any,
    river_flags: any,
    route: any,
    script: any,
    start: any,
    terrain: any,
    tile: any,
    unit_references: any,
    units: any,
    visibility_counts: any,
    x: any,
    y: any;
  start = r.pos;
  if (compat.truth(!compat.eq(r.unpack("I"), 7))) {
    throw new compat.ParseError(
      "unsupported plot version at byte " + compat.format(start, ""),
    );
  }
  {
    const __v3 = compat.iter([r.unpack("h"), r.unpack("h")]);
    x = __v3[0];
    y = __v3[1];
  }
  pillaged = compat.truth(
    compat.compare(
      compat.add(start, compat.get(profile, "routePillageOffset")),
      compat.len(r.data),
    ) < 0,
  )
    ? compat.get(
        r.data,
        compat.add(start, compat.get(profile, "routePillageOffset")),
      )
    : -1;
  river_flags = compat.slice(
    r.data,
    compat.add(start, 45),
    compat.add(start, 48),
    null,
  );
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(compat.len(river_flags), 3),
        () =>
          compat.any(
            (() => {
              const __v4: any[] = [];
              for (const __v5 of compat.iter(river_flags)) {
                let b: any = __v5;
                __v4.push(!compat.has([0, 1], b));
              }
              return __v4;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid river presence flags");
  }
  if (compat.truth(!compat.has([0, 1], pillaged))) {
    throw new compat.ParseError("invalid route pillage flag");
  }
  r.take(compat.sub(compat.get(profile, "ownerOffset"), 8));
  {
    const __v8 = compat.iter(
      (() => {
        const __v6: any[] = [];
        for (const __v7 of compat.iter(compat.range(3))) {
          let _: any = __v7;
          __v6.push(r.unpack("b"));
        }
        return __v6;
      })(),
    );
    owner = __v8[0];
    plot = __v8[1];
    terrain = __v8[2];
  }
  {
    const __v11 = compat.iter(
      (() => {
        const __v9: any[] = [];
        for (const __v10 of compat.iter(compat.range(4))) {
          let _: any = __v10;
          __v9.push(r.unpack("I"));
        }
        return __v9;
      })(),
    );
    feature = __v11[0];
    resource = __v11[1];
    improvement = __v11[2];
    construction = __v11[3];
  }
  r.take(4);
  route = r.unpack("b");
  if (
    compat.truth(
      !compat.truth(
        compat.compare(-1, route) <= 0 && compat.compare(route, 127) <= 0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid route ID");
  }
  r.take(2);
  flows = (() => {
    const __v12: any[] = [];
    for (const __v13 of compat.iter(compat.range(3))) {
      let _: any = __v13;
      __v12.push(r.unpack("b"));
    }
    return __v12;
  })();
  {
    const __v14 = compat.iter([r.unpack("i"), r.unpack("i")]);
    city_owner = __v14[0];
    city_id = __v14[1];
  }
  r.take(24);
  const territory_owner = r.unpack("i"),
    territory_id = r.unpack("i");
  r.take(
    compat.add(
      compat.add(compat.mul(compat.get(profile, "yields"), 2), 320),
      80,
    ),
  );
  visibility_counts = (() => {
    const __v15: any[] = [];
    for (const __v16 of compat.iter(compat.range(80))) {
      let _: any = __v16;
      __v15.push(r.unpack("h"));
    }
    return __v15;
  })();
  r.take(compat.add(80, 1));
  revealed = compat.fromBytes(r.take(16), "little");
  r.take(compat.add(compat.add(compat.add(80, 320), 160), 22));
  script = r.unpack("B");
  if (compat.truth(!compat.has([0, 1], script))) {
    throw new compat.ParseError(
      "invalid script flag at byte " + compat.format(compat.sub(r.pos, 1), ""),
    );
  }
  if (compat.truth(script)) {
    r.string();
  }
  builds = r.count();
  if (compat.truth(builds)) {
    entries = r.count();
    if (compat.truth(!compat.eq(entries, builds))) {
      throw new compat.ParseError("build-array size mismatch");
    }
    for (const __v17 of compat.iter(compat.range(entries))) {
      _ = __v17;
      if (compat.truth(r.unpack("I"))) {
        r.take(2);
      }
    }
  }
  r.take(160);
  units = r.count(4096);
  unit_references = (() => {
    const __v18: any[] = [];
    for (const __v19 of compat.iter(compat.range(units))) {
      let _: any = __v19;
      __v18.push(
        compat.dict([
          ["owner", r.unpack("i")],
          ["localId", r.unpack("i")],
        ]),
      );
    }
    return __v18;
  })();
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v20: any[] = [];
          for (const __v21 of compat.iter(unit_references)) {
            let u: any = __v21;
            __v20.push(
              compat.or(
                () =>
                  !compat.truth(
                    compat.compare(0, compat.get(u, "owner")) <= 0 &&
                      compat.compare(compat.get(u, "owner"), 64) < 0,
                  ),
                () => compat.compare(compat.get(u, "localId"), 0) < 0,
              ),
            );
          }
          return __v20;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid plot unit reference");
  }
  if (
    compat.truth(
      !compat.eq(
        compat.len(
          (() => {
            const __v22: any[] = [];
            for (const __v23 of compat.iter(unit_references)) {
              let u: any = __v23;
              __v22.push([compat.get(u, "owner"), compat.get(u, "localId")]);
            }
            return compat.set(__v22);
          })(),
        ),
        units,
      ),
    )
  ) {
    throw new compat.ParseError("duplicate plot unit reference");
  }
  r.take(1);
  arch = r.unpack("I");
  if (compat.truth(!compat.has([1, 2], arch))) {
    throw new compat.ParseError(
      "unsupported archaeology version " + compat.format(arch, ""),
    );
  }
  r.take(compat.truth(compat.eq(arch, 2)) ? 20 : 16);
  if (
    compat.truth(
      !compat.truth(
        compat.and(
          () => compat.compare(-1, owner) <= 0 && compat.compare(owner, 64) < 0,
          () =>
            compat.and(
              () =>
                compat.compare(0, plot) <= 0 && compat.compare(plot, 3) <= 0,
              () =>
                compat.compare(-1, terrain) <= 0 &&
                compat.compare(terrain, 127) <= 0,
            ),
        ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "invalid plot enums at (" +
        compat.format(x, "") +
        ", " +
        compat.format(y, "") +
        ")",
    );
  }
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v24: any[] = [];
          for (const __v25 of compat.iter(flows)) {
            let flow: any = __v25;
            __v24.push(!compat.has(compat.range(-1, 6), flow));
          }
          return __v24;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid river flow direction");
  }
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(compat.eq(city_owner, -1), compat.eq(city_id, -1)),
        () =>
          !compat.truth(
            compat.compare(-1, city_owner) <= 0 &&
              compat.compare(city_owner, 64) < 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid plot city reference");
  }
  tile = compat.dict([
    ["x", x],
    ["y", y],
    ["landWater", compat.truth(compat.eq(plot, 3)) ? "water" : "land"],
    ["owner", compat.truth(compat.eq(owner, -1)) ? null : owner],
    ["ownershipKnown", true],
    [
      "elevation",
      compat.get(
        compat.dict([
          [0, "mountain"],
          [1, "hills"],
          [2, "flat"],
          [3, "flat"],
        ]),
        plot,
      ),
    ],
    ["terrain", null],
    ["terrainId", terrain],
    [
      "featureHash",
      compat.truth(feature) ? compat.format(feature, "08x") : null,
    ],
    [
      "resourceHash",
      compat.truth(resource) ? compat.format(resource, "08x") : null,
    ],
    ["routeKnown", true],
    ["routeId", compat.truth(compat.eq(route, -1)) ? null : route],
    ["route", null],
    ["routePillaged", compat.bool(pillaged)],
    [
      "riverEdges",
      (() => {
        const __v26: any[] = [];
        for (const __v27 of compat.iter(
          compat.zip(river_flags, ["SW", "E", "SE"]),
        )) {
          let [flag, edge] = compat.iter(__v27);
          if (!compat.truth(flag)) continue;
          __v26.push(edge);
        }
        return __v26;
      })(),
    ],
    ["riverFlowDirections", compat.dict(compat.zip(["E", "SE", "SW"], flows))],
    ["isLake", null],
    [
      "visibility",
      (() => {
        const __v28: any[] = [];
        for (const __v29 of compat.iter(compat.range(64))) {
          let i: any = __v29;
          __v28.push([
            compat.str(i),
            compat.truth(
              compat.compare(compat.get(visibility_counts, i), 0) > 0,
            )
              ? "visible"
              : compat.truth(compat.bitAnd(revealed, compat.shiftLeft(1, i)))
                ? "revealed"
                : "unrevealed",
          ]);
        }
        return compat.dict(__v28);
      })(),
    ],
  ]);
  if (
    compat.truth(
      compat.or(
        () => compat.eq(feature, 0),
        () => compat.has(FEATURE_HASHES, feature),
      ),
    )
  ) {
    compat.put(tile, "feature", compat.get(FEATURE_HASHES, feature, null));
  }
  if (compat.truth(!compat.eq(city_owner, -1))) {
    if (
      compat.truth(
        compat.or(
          () => !compat.eq(city_owner, owner),
          () => compat.eq(plot, 3),
        ),
      )
    ) {
      throw new compat.ParseError("plot city ownership/geography mismatch");
    }
    compat.put(
      tile,
      "cityReference",
      compat.dict([
        ["owner", city_owner],
        ["localId", city_id],
      ]),
    );
  }
  const territory_valid =
    (territory_owner === -1 && territory_id === -1) ||
    (territory_owner >= 0 && territory_owner < 64 && territory_id >= 0);
  compat.put(tile, "territoryCityKnown", territory_valid);
  compat.put(
    tile,
    "territoryCityReference",
    territory_valid && territory_owner !== -1
      ? compat.dict([
          ["owner", territory_owner],
          ["localId", territory_id],
        ])
      : null,
  );
  return [
    tile,
    compat.dict([
      ["offset", start],
      ["endOffset", r.pos],
      ["unitReferences", unit_references],
    ]),
  ];
}
export function read_plots(state: any, header: any, profile: any): any {
  let index: any, r: any, record: any, records: any, tile: any, tiles: any;
  r = new Reader(state, compat.get(header, "endOffset"));
  {
    const __v30 = compat.iter([[], []]);
    tiles = __v30[0];
    records = __v30[1];
  }
  for (const __v31 of compat.iter(
    compat.range(
      compat.mul(compat.get(header, "width"), compat.get(header, "height")),
    ),
  )) {
    index = __v31;
    {
      const __v32 = compat.iter(read_plot(r, profile));
      tile = __v32[0];
      record = __v32[1];
    }
    if (
      compat.truth(
        !compat.eq(
          [compat.get(tile, "x"), compat.get(tile, "y")],
          [
            compat.mod(index, compat.get(header, "width")),
            compat.floorDiv(index, compat.get(header, "width")),
          ],
        ),
      )
    ) {
      throw new compat.ParseError(
        "plot coordinate/order mismatch at index " + compat.format(index, ""),
      );
    }
    compat.append(tiles, tile);
    compat.append(records, record);
  }
  if (
    compat.truth(
      !compat.eq(
        compat.sum(
          (() => {
            const __v33: any[] = [];
            for (const __v34 of compat.iter(tiles)) {
              let t: any = __v34;
              __v33.push(compat.eq(compat.get(t, "landWater"), "land"));
            }
            return __v33;
          })(),
        ),
        compat.get(header, "landPlots"),
      ),
    )
  ) {
    throw new compat.ParseError("land aggregate mismatch");
  }
  if (
    compat.truth(
      !compat.eq(
        compat.sum(
          (() => {
            const __v35: any[] = [];
            for (const __v36 of compat.iter(tiles)) {
              let t: any = __v36;
              __v35.push(compat.get(t, "owner") !== null);
            }
            return __v35;
          })(),
        ),
        compat.get(header, "ownedPlots"),
      ),
    )
  ) {
    throw new compat.ParseError("ownership aggregate mismatch");
  }
  return [
    tiles,
    compat.dict([
      ["offset", compat.get(header, "endOffset")],
      ["endOffset", r.pos],
      ["records", records],
    ]),
  ];
}
export function read_city_candidate(
  state: any,
  offset: any,
  profile: any,
  tile: any,
): any {
  let _: any, count: any, flags: any, name: any, r: any, ref: any, scalars: any;
  r = new Reader(state, offset);
  if (compat.truth(!compat.eq(r.unpack("I"), 6))) {
    throw new compat.ParseError("unsupported city version");
  }
  scalars = (() => {
    const __v37: any[] = [];
    for (const __v38 of compat.iter(
      compat.range(compat.get(profile, "cityScalars")),
    )) {
      let _: any = __v38;
      __v37.push(r.unpack("i"));
    }
    return __v37;
  })();
  ref = compat.get(tile, "cityReference");
  if (
    compat.truth(
      !compat.eq(compat.slice(scalars, null, 3, null), [
        compat.get(ref, "localId"),
        compat.get(tile, "x"),
        compat.get(tile, "y"),
      ]),
    )
  ) {
    throw new compat.ParseError("city ID/coordinate mismatch");
  }
  flags = r.take(10);
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v39: any[] = [];
          for (const __v40 of compat.iter(flags)) {
            let v: any = __v40;
            __v39.push(!compat.has([0, 1], v));
          }
          return __v39;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid city flag");
  }
  if (compat.truth(!compat.eq(r.unpack("i"), compat.get(ref, "owner")))) {
    throw new compat.ParseError("city owner mismatch");
  }
  r.take(compat.add(12, compat.get(profile, "cityOwnerPadding")));
  for (const __v41 of compat.iter(
    compat.range(compat.get(profile, "cityYieldVectors")),
  )) {
    _ = __v41;
    count = r.count();
    if (compat.truth(!compat.eq(count, compat.get(profile, "yields")))) {
      throw new compat.ParseError("city yield-vector size mismatch");
    }
    r.take(compat.mul(count, 4));
  }
  for (const __v42 of compat.iter(compat.range(2))) {
    _ = __v42;
    count = r.count();
    if (compat.truth(!compat.eq(count, 5))) {
      throw new compat.ParseError("city domain-vector size mismatch");
    }
    r.take(compat.mul(count, 4));
  }
  for (const __v43 of compat.iter(compat.range(2))) {
    _ = __v43;
    count = r.count();
    if (compat.truth(!compat.eq(count, 80))) {
      throw new compat.ParseError("city player/team-vector size mismatch");
    }
    if (
      compat.truth(
        compat.any(
          (() => {
            const __v44: any[] = [];
            for (const __v45 of compat.iter(r.take(count))) {
              let v: any = __v45;
              __v44.push(!compat.has([0, 1], v));
            }
            return __v44;
          })(),
        ),
      )
    ) {
      throw new compat.ParseError("invalid city player/team flag");
    }
  }
  r.take(compat.get(profile, "cityNamePadding"));
  name = r.string();
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.compare(1, compat.len(name)) <= 0 &&
              compat.compare(compat.len(name), 256) <= 0,
          ),
        () =>
          compat.any(
            (() => {
              const __v46: any[] = [];
              for (const __v47 of compat.iter(name)) {
                let c: any = __v47;
                __v46.push(!compat.truth(compat.isprintable(c)));
              }
              return __v46;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid city name");
  }
  if (
    compat.truth(
      !compat.truth(
        compat.compare(1, compat.get(scalars, 7)) <= 0 &&
          compat.compare(compat.get(scalars, 7), 10000) <= 0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid city population");
  }
  return compat.dict([
    [
      "id",
      compat.format(compat.get(ref, "owner"), "") +
        ":" +
        compat.format(compat.get(ref, "localId"), ""),
    ],
    ["localId", compat.get(ref, "localId")],
    ["x", compat.get(tile, "x")],
    ["y", compat.get(tile, "y")],
    ["owner", compat.get(ref, "owner")],
    ["population", compat.get(scalars, 7)],
    ["name", name],
    [
      "nameKey",
      compat.truth(compat.startswith(name, "TXT_KEY_")) ? name : null,
    ],
    ["capital", null],
    [
      "evidence",
      compat.dict([
        ["offset", offset],
        ["nameEndOffset", r.pos],
      ]),
    ],
  ]);
}
export function read_cities(
  state: any,
  tiles: any,
  minimum: any,
  profile: any,
  gameHeaderPadding = 0,
): any {
  let candidates: any,
    cities: any,
    expected: any,
    pos: any,
    ref: any,
    signature: any,
    tile: any;
  cities = [];
  for (const __v48 of compat.iter(tiles)) {
    tile = __v48;
    if (compat.truth(!compat.has(tile, "cityReference"))) {
      continue;
    }
    ref = compat.get(tile, "cityReference");
    signature = compat.struct.pack(
      "<Iiii",
      6,
      compat.get(ref, "localId"),
      compat.get(tile, "x"),
      compat.get(tile, "y"),
    );
    {
      const __v49 = compat.iter([[], minimum]);
      candidates = __v49[0];
      pos = __v49[1];
    }
    while (
      compat.truth(
        compat.compare((pos = compat.find(state, signature, pos)), 0) >= 0,
      )
    ) {
      try {
        compat.append(
          candidates,
          read_city_candidate(state, pos, profile, tile),
        );
      } catch (__v50) {
        if (__v50 instanceof compat.ParseError) {
        } else {
          throw __v50;
        }
      }
      pos = compat.add(pos, 1);
    }
    if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
      throw new compat.ParseError(
        "city " +
          compat.format(compat.get(ref, "owner"), "") +
          ":" +
          compat.format(compat.get(ref, "localId"), "") +
          " has " +
          compat.format(compat.len(candidates), "") +
          " valid current-state candidates",
      );
    }
    compat.append(cities, compat.get(candidates, 0));
  }
  expected = compat.get(
    compat.struct.unpack_from("<i", state, 40 + gameHeaderPadding),
    0,
  );
  if (compat.truth(!compat.eq(compat.len(cities), expected))) {
    throw new compat.ParseError(
      "city aggregate mismatch: decoded " +
        compat.format(compat.len(cities), "") +
        ", header " +
        compat.format(expected, ""),
    );
  }
  if (
    compat.truth(
      !compat.eq(
        compat.len(
          (() => {
            const __v51: any[] = [];
            for (const __v52 of compat.iter(cities)) {
              let c: any = __v52;
              __v51.push(compat.get(c, "id"));
            }
            return compat.set(__v51);
          })(),
        ),
        compat.len(cities),
      ),
    )
  ) {
    throw new compat.ParseError("duplicate city identity");
  }
  return cities;
}
export function extract_bytes(
  data: any,
  profile_name: any = "auto",
  include_player_names: any = true,
  include_units: any = false,
): any {
  let arrays: any,
    candidates: any,
    cities: any,
    civ: any,
    diagnostics: any,
    errors: any,
    fields: any,
    header: any,
    marker: any,
    matches: any,
    name: any,
    names: any,
    owner: any,
    pos: any,
    prefix: any,
    present: any,
    roster: any,
    setup: any,
    state: any,
    tile: any,
    tiles: any,
    values: any,
    world: any;
  {
    const __v53 = compat.iter(
      inspect_bytes(data, undefined, include_player_names),
    );
    world = __v53[0];
    state = __v53[1];
  }
  header = compat.get(compat.get(world, "inspection"), "mapHeader");
  if (
    compat.truth(
      !compat.eq(
        compat.get(compat.get(world, "game"), "turn"),
        compat.get(compat.get(world, "inspection"), "elapsedTurns"),
      ),
    )
  ) {
    throw new compat.ParseError("setup/state turn mismatch");
  }
  if (
    compat.truth(
      compat.or(
        () => header === null,
        () =>
          !compat.eq(
            compat.get(compat.get(world, "inspection"), "stateVersion"),
            1,
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "extraction requires a supported BNW map and game-state header",
    );
  }
  names = compat.truth(compat.eq(profile_name, "auto"))
    ? compat.list(PROFILES)
    : [profile_name];
  {
    const __v54 = compat.iter([[], []]);
    matches = __v54[0];
    errors = __v54[1];
  }
  for (const __v55 of compat.iter(names)) {
    name = __v55;
    if (compat.truth(!compat.has(PROFILES, name))) {
      throw new compat.ParseError("unknown profile " + compat.format(name, ""));
    }
    try {
      const padding = compat.get(
        compat.get(PROFILES, name),
        "gameHeaderPadding",
        0,
      );
      if (
        compat.get(compat.struct.unpack_from("<I", state, 8 + padding), 0) !==
        compat.get(compat.get(world, "game"), "turn")
      )
        throw new compat.ParseError(
          "setup/state turn mismatch for this layout",
        );
      {
        const __v57 = compat.iter(
          read_plots(state, header, compat.get(PROFILES, name)),
        );
        tiles = __v57[0];
        diagnostics = __v57[1];
      }
      compat.append(matches, [name, tiles, diagnostics]);
    } catch (__v56) {
      if (__v56 instanceof compat.ParseError) {
        let exc = __v56;
        compat.append(
          errors,
          compat.format(name, "") + ": " + compat.format(exc, ""),
        );
      } else {
        throw __v56;
      }
    }
  }
  if (compat.truth(!compat.eq(compat.len(matches), 1))) {
    throw new compat.ParseError(
      compat.add(
        "expected exactly one validated plot layout: ",
        compat.join("; ", errors),
      ),
    );
  }
  {
    const __v58 = compat.iter(compat.get(matches, 0));
    name = __v58[0];
    tiles = __v58[1];
    diagnostics = __v58[2];
  }
  cities = read_cities(
    state,
    tiles,
    compat.get(diagnostics, "endOffset"),
    compat.get(PROFILES, name),
    compat.get(compat.get(PROFILES, name), "gameHeaderPadding", 0),
  );
  {
    const __v59 = compat.iter([tiles, cities]);
    compat.put(world, "tiles", __v59[0]);
    compat.put(world, "cities", __v59[1]);
  }
  compat.put(compat.get(world, "inspection"), "plots", diagnostics);
  compat.put(compat.get(world, "inspection"), "profile", name);
  const gameHeaderPadding = compat.get(
    compat.get(PROFILES, name),
    "gameHeaderPadding",
    0,
  );
  if (gameHeaderPadding)
    compat.put(
      compat.get(world, "inspection"),
      "gameHeaderPadding",
      gameHeaderPadding,
    );
  roster = (() => {
    const __v60: any[] = [];
    for (const __v61 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v61;
      __v60.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v60);
  })();
  setup = compat.slice(
    data,
    null,
    compat.sub(
      compat.get(
        compat.get(compat.get(world, "inspection"), "compression"),
        "offset",
      ),
      8,
    ),
    null,
  );
  arrays = compat.dict([]);
  for (const __v62 of compat.iter(["PLAYERCOLOR_", "MINOR_CIV_"])) {
    prefix = __v62;
    {
      const __v63 = compat.iter([
        [],
        compat.get(
          compat.get(compat.get(world, "inspection"), "header"),
          "parsedHeaderEnd",
        ),
      ]);
      candidates = __v63[0];
      pos = __v63[1];
    }
    marker = compat.struct.pack("<I", 64);
    while (
      compat.truth(
        compat.compare((pos = compat.find(setup, marker, pos)), 0) >= 0,
      )
    ) {
      try {
        values = new Reader(setup, pos).strings();
        present = (() => {
          const __v65: any[] = [];
          for (const __v66 of compat.iter(values)) {
            let value: any = __v66;
            if (!compat.truth(value)) continue;
            __v65.push(value);
          }
          return __v65;
        })();
        if (
          compat.truth(
            compat.and(
              () => present,
              () =>
                compat.all(
                  (() => {
                    const __v67: any[] = [];
                    for (const __v68 of compat.iter(present)) {
                      let value: any = __v68;
                      __v67.push(compat.startswith(value, prefix));
                    }
                    return __v67;
                  })(),
                ),
            ),
          )
        ) {
          compat.append(candidates, values);
        }
      } catch (__v64) {
        if (__v64 instanceof compat.ParseError) {
        } else {
          throw __v64;
        }
      }
      pos = compat.add(pos, 1);
    }
    if (compat.truth(compat.eq(compat.len(candidates), 1))) {
      compat.put(arrays, prefix, compat.get(candidates, 0));
    } else {
      if (compat.truth(compat.compare(compat.len(candidates), 1) > 0)) {
        throw new compat.ParseError(
          "ambiguous " + compat.format(prefix, "") + " setup array",
        );
      }
    }
  }
  for (const __v69 of compat.iter(tiles)) {
    tile = __v69;
    owner = compat.get(tile, "owner");
    if (
      compat.truth(
        compat.and(
          () => owner !== null,
          () => !compat.has(roster, owner),
        ),
      )
    ) {
      throw new compat.ParseError(
        "owner " + compat.format(owner, "") + " missing from setup roster",
      );
    }
  }
  for (const __v70 of compat.iter(compat.values(roster))) {
    civ = __v70;
    compat.put(
      civ,
      "kind",
      compat.truth(compat.eq(compat.get(civ, "key"), "CIVILIZATION_MINOR"))
        ? "city-state"
        : compat.truth(
              compat.eq(compat.get(civ, "key"), "CIVILIZATION_BARBARIAN"),
            )
          ? "barbarian"
          : "major",
    );
    if (compat.truth(compat.has(arrays, "PLAYERCOLOR_"))) {
      compat.put(
        civ,
        "colorKey",
        compat.or(
          () =>
            compat.get(
              compat.get(arrays, "PLAYERCOLOR_"),
              compat.get(civ, "id"),
            ),
          () => null,
        ),
      );
    }
    if (
      compat.truth(
        compat.and(
          () => compat.has(arrays, "MINOR_CIV_"),
          () =>
            compat.get(compat.get(arrays, "MINOR_CIV_"), compat.get(civ, "id")),
        ),
      )
    ) {
      compat.put(
        civ,
        "minorKey",
        compat.get(compat.get(arrays, "MINOR_CIV_"), compat.get(civ, "id")),
      );
    }
  }
  compat.put(compat.get(world, "extraction"), "status", "complete");
  fields = compat.get(compat.get(world, "extraction"), "fields");
  compat.update(
    fields,
    compat.dict([
      ["tileCoordinates", "extracted"],
      ["landWater", "extracted"],
      ["tileOwnership", "extracted"],
      ["cities", "extracted"],
      ["features", "partial"],
      ["terrain", "partial"],
      ["rivers", "extracted"],
      ["capitals", "unavailable"],
      ["civilizationColors", "partial"],
    ]),
  );
  compat.put(compat.get(world, "extraction"), "warnings", [
    "Experimental layout profile; supported-save extraction, not arbitrary Civ V compatibility.",
    "Map location and city records use validated anchors; player serialization is not fully traversed.",
    "City labels may be localization keys; lake status and elimination remain unknown.",
    "Terrain IDs and unresolved feature hashes need the matching ruleset; presentation colors may be defaults.",
  ]);
  if (
    compat.truth(
      !compat.truth(
        compat.get(
          compat.get(compat.get(world, "inspection"), "compression"),
          "endMarkerPresent",
        ),
      ),
    )
  ) {
    compat.append(
      compat.get(compat.get(world, "extraction"), "warnings"),
      "Zlib end marker absent; decoded grid and city aggregates passed, later sections not validated.",
    );
  }

  const cityAssignments = new Set(
    compat
      .iter(cities)
      .map(
        (city: any) =>
          `${compat.get(city, "owner")}:${compat.get(city, "localId")}`,
      ),
  );
  let invalidAssignments = 0;
  for (const t of compat.iter(tiles)) {
    const ref = compat.get(t, "territoryCityReference");
    if (
      compat.get(t, "territoryCityKnown") !== true ||
      (ref &&
        (compat.get(ref, "owner") !== compat.get(t, "owner") ||
          !cityAssignments.has(
            `${compat.get(ref, "owner")}:${compat.get(ref, "localId")}`,
          )))
    ) {
      invalidAssignments++;
      compat.put(t, "territoryCityKnown", false);
      compat.put(t, "territoryCityReference", null);
    }
  }
  compat.put(
    fields,
    "territoryCityAssignment",
    invalidAssignments ? "partial" : "extracted",
  );
  const withReligion = extractCityReligions(
    compat.unwrap(world),
    state,
    compat.get(compat.get(PROFILES, name), "yields"),
  );
  extractReligionCatalog(withReligion, state);
  compat.put(world, "cities", compat.wrapJson(withReligion.cities));
  if (withReligion.religions)
    compat.put(world, "religions", compat.wrapJson(withReligion.religions));
  compat.update(fields, compat.wrapJson(withReligion.extraction.fields));
  compat.put(
    compat.get(world, "extraction"),
    "warnings",
    compat.wrapJson(withReligion.extraction.warnings),
  );
  if (invalidAssignments)
    compat.append(
      compat.get(compat.get(world, "extraction"), "warnings"),
      `${invalidAssignments} saved territory city references could not be validated; assignments remain unknown.`,
    );

  add_alliances(world, state, compat.get(compat.get(PROFILES, name), "yields"));

  add_capitals(world, state, name);
  compat.put(
    fields,
    "routes",
    compat.truth(
      compat.any(
        (() => {
          const __v71: any[] = [];
          for (const __v72 of compat.iter(tiles)) {
            let t: any = __v72;
            __v71.push(compat.get(t, "routeId") !== null);
          }
          return __v71;
        })(),
      ),
    )
      ? "partial"
      : "extracted",
  );
  compat.put(fields, "roadConnections", "extracted");
  compat.put(
    fields,
    "playerNames",
    compat.truth(
      compat.any(
        (() => {
          const __v73: any[] = [];
          for (const __v74 of compat.iter(compat.values(roster))) {
            let c: any = __v74;
            __v73.push(compat.get(c, "playerName", null));
          }
          return __v73;
        })(),
      ),
    )
      ? "partial"
      : "unavailable",
  );
  if (compat.truth(include_units)) {
    extract_units(world, state, name);
  }
  const normalized = compat.unwrap(world);
  extractCulture(normalized, state);
  return compat.wrapJson(normalized);
}
