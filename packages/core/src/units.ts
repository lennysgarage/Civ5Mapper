// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { ParseError, Reader } from "./save.js";
import { player_anchors } from "./diplomacy.js";
export let UNIT_PROFILES: any;
/** Opt-in current plot-referenced units, with narrowly validated v9/v10 profiles.

Prefix order and archive tail follow SDK CvUnit.h/CvUnit.cpp. String offsets
are empirical for the tested DLL families, not a generic archive decoder.
Uninterpreted archive bytes never acquire invented field meanings.
 */

UNIT_PROFILES = compat.dict([
  ["bnw-six-yield", 507],
  ["observed-seven-yield", 931],
  ["observed-eight-yield", 962],
]);
export function read_unit(
  state: any,
  offset: any,
  limit: any,
  reference: any,
  tile: any,
  profile: any,
): any {
  let _: any,
    active: any,
    count: any,
    hash_offset: any,
    hashes: any,
    legacy_name: any,
    local_id: any,
    original: any,
    owner: any,
    promotion: any,
    r: any,
    sizes: any,
    total: any,
    type_hash: any,
    type_id: any,
    x: any,
    y: any;
  r = new Reader(
    compat.slice(compat.memoryview(state), null, limit, null),
    offset,
  );
  const unitVersion = profile === "observed-eight-yield" ? 10 : 9;
  if (compat.truth(!compat.eq(r.unpack("I"), unitVersion))) {
    throw new compat.ParseError(
      "unsupported unit version; requires validated v" + unitVersion,
    );
  }
  {
    const __v3 = compat.iter(
      (() => {
        const __v1: any[] = [];
        for (const __v2 of compat.iter(compat.range(6))) {
          let _: any = __v2;
          __v1.push(r.unpack("i"));
        }
        return __v1;
      })(),
    );
    owner = __v3[0];
    original = __v3[1];
    type_id = __v3[2];
    x = __v3[3];
    y = __v3[4];
    local_id = __v3[5];
  }
  if (
    compat.truth(
      !compat.eq(
        [owner, local_id, x, y],
        [
          compat.get(reference, "owner"),
          compat.get(reference, "localId"),
          compat.get(tile, "x"),
          compat.get(tile, "y"),
        ],
      ),
    )
  ) {
    throw new compat.ParseError("unit identity/coordinate mismatch");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.compare(0, original) <= 0 &&
              compat.compare(original, 64) < 0,
          ),
        () =>
          !compat.truth(
            compat.compare(0, type_id) <= 0 &&
              compat.compare(type_id, 100000) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid unit identity/type");
  }
  r.take(compat.sub(compat.get(UNIT_PROFILES, profile), 28));
  legacy_name = r.string();
  if (
    compat.truth(
      compat.or(
        () => compat.compare(compat.len(legacy_name), 256) > 0,
        () =>
          compat.any(
            (() => {
              const __v4: any[] = [];
              for (const __v5 of compat.iter(legacy_name)) {
                let c: any = __v5;
                __v4.push(!compat.truth(compat.isprintable(c)));
              }
              return __v4;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid unit archive legacy name");
  }
  r.string();
  sizes = [];
  for (const __v6 of compat.iter(compat.range(10))) {
    _ = __v6;
    count = r.count(4096);
    if (compat.truth(!compat.truth(count))) {
      throw new compat.ParseError(
        "empty unit terrain/feature/combat/class vector",
      );
    }
    compat.append(sizes, count);
    r.take(compat.mul(count, 4));
  }
  if (
    compat.truth(
      !compat.truth(
        compat.and(
          () =>
            compat.eq(compat.get(sizes, 0), compat.get(sizes, 2)) &&
            compat.eq(compat.get(sizes, 2), compat.get(sizes, 4)) &&
            compat.eq(compat.get(sizes, 4), compat.get(sizes, 5)),
          () =>
            compat.eq(compat.get(sizes, 1), compat.get(sizes, 3)) &&
            compat.eq(compat.get(sizes, 3), compat.get(sizes, 6)) &&
            compat.eq(compat.get(sizes, 6), compat.get(sizes, 7)),
        ),
      ),
    )
  ) {
    throw new compat.ParseError("unit archive vector dimensions disagree");
  }
  r.take(24);
  hash_offset = r.pos;
  type_hash = r.unpack("I");
  if (compat.truth(!compat.truth(type_hash))) {
    throw new compat.ParseError("missing serialized unit type hash");
  }
  r.take(4);
  if (compat.truth(!compat.eq(r.unpack("I"), 1))) {
    throw new compat.ParseError("unsupported unit promotions version");
  }
  total = r.count(4096);
  if (compat.truth(!compat.truth(total))) {
    throw new compat.ParseError("invalid unit promotion capacity");
  }
  count = r.count(total);
  hashes = compat.set();
  for (const __v7 of compat.iter(compat.range(count))) {
    _ = __v7;
    promotion = r.unpack("I");
    active = r.unpack("B");
    if (
      compat.truth(
        compat.or(
          () => !compat.truth(promotion),
          () =>
            compat.or(
              () => compat.has(hashes, promotion),
              () => !compat.eq(active, 1),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid active unit promotion entry");
    }
    compat.add(hashes, promotion);
  }
  return compat.dict([
    ["id", compat.format(owner, "") + ":" + compat.format(local_id, "")],
    ["localId", local_id],
    ["owner", owner],
    ["x", x],
    ["y", y],
    ["unitTypeId", type_id],
    ["unitTypeHash", compat.format(type_hash, "08x")],
    ["type", null],
    ["name", null],
    ["domain", null],
    ["isMilitary", null],
    ["classificationKnown", false],
    [
      "evidence",
      compat.dict([
        ["offset", offset],
        ["typeHashOffset", hash_offset],
        ["validatedThroughOffset", r.pos],
        ["unitVersion", unitVersion],
        ["archiveStringOffset", compat.get(UNIT_PROFILES, profile)],
        ["vectorSizes", sizes],
      ]),
    ],
  ]);
}
export function extract_units(world: any, state: any, profile: any): any {
  if (!compat.has(UNIT_PROFILES, profile))
    throw new ParseError("unit layout has not been validated for " + profile);
  let anchors: any,
    candidates: any,
    hi: any,
    identities: any,
    lo: any,
    offset: any,
    owner: any,
    plots: any,
    pos: any,
    ref: any,
    references: any,
    roster: any,
    signature: any,
    tile: any,
    units: any;
  plots = compat.get(compat.get(world, "inspection"), "plots");
  references = (() => {
    const __v8: any[] = [];
    for (const __v9 of compat.iter(
      compat.zip(compat.get(world, "tiles"), compat.get(plots, "records")),
    )) {
      let [tile, record] = compat.iter(__v9);
      for (const __v10 of compat.iter(compat.get(record, "unitReferences"))) {
        let ref: any = __v10;
        __v8.push([tile, ref]);
      }
    }
    return __v8;
  })();
  if (compat.truth(compat.compare(compat.len(references), 100000) > 0)) {
    throw new compat.ParseError("current unit reference budget exceeded");
  }
  identities = (() => {
    const __v11: any[] = [];
    for (const __v12 of compat.iter(references)) {
      let [tile, ref] = compat.iter(__v12);
      __v11.push([compat.get(ref, "owner"), compat.get(ref, "localId")]);
    }
    return __v11;
  })();
  if (
    compat.truth(
      !compat.eq(compat.len(compat.set(identities)), compat.len(identities)),
    )
  ) {
    throw new compat.ParseError("unit referenced on multiple plots");
  }
  roster = (() => {
    const __v13: any[] = [];
    for (const __v14 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v14;
      __v13.push(compat.get(c, "id"));
    }
    return compat.set(__v13);
  })();
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v15: any[] = [];
          for (const __v16 of compat.iter(references)) {
            let [tile, ref] = compat.iter(__v16);
            __v15.push(!compat.has(roster, compat.get(ref, "owner")));
          }
          return __v15;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("plot unit owner absent from roster");
  }
  units = [];
  if (compat.truth(references)) {
    anchors = player_anchors(
      state,
      compat.get(plots, "endOffset"),
      profile === "bnw-six-yield"
        ? 6
        : profile === "observed-eight-yield"
          ? 8
          : 7,
      compat.get(world, "cities"),
    );
    for (const __v17 of compat.iter(references)) {
      {
        const __v18 = compat.iter(__v17);
        tile = __v18[0];
        ref = __v18[1];
      }
      owner = compat.get(ref, "owner");
      lo = compat.get(compat.get(anchors, owner), "endOffset");
      hi = compat.truth(compat.compare(owner, 63) < 0)
        ? compat.get(compat.get(anchors, compat.add(owner, 1)), "offset")
        : compat.len(state);
      signature = compat.struct.pack(
        "<3i",
        compat.get(tile, "x"),
        compat.get(tile, "y"),
        compat.get(ref, "localId"),
      );
      {
        const __v19 = compat.iter([[], lo]);
        candidates = __v19[0];
        pos = __v19[1];
      }
      while (
        compat.truth(
          compat.compare((pos = compat.find(state, signature, pos, hi)), 0) >=
            0,
        )
      ) {
        offset = compat.sub(pos, 16);
        if (compat.truth(compat.compare(offset, lo) >= 0)) {
          try {
            compat.append(
              candidates,
              read_unit(state, offset, hi, ref, tile, profile),
            );
          } catch (__v20) {
            if (__v20 instanceof compat.ParseError) {
            } else {
              throw __v20;
            }
          }
        }
        pos = compat.add(pos, 1);
      }
      if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
        throw new compat.ParseError(
          "unit " +
            compat.format(owner, "") +
            ":" +
            compat.format(compat.get(ref, "localId"), "") +
            " has " +
            compat.format(compat.len(candidates), "") +
            " validated v" +
            (profile === "observed-eight-yield" ? 10 : 9) +
            " records; unknown/ambiguous unit layout",
        );
      }
      compat.append(units, compat.get(candidates, 0));
    }
  }
  compat.put(
    world,
    "units",
    compat.sorted(
      units,
      compat.dict([
        ["key", (u: any) => [compat.get(u, "owner"), compat.get(u, "localId")]],
      ]),
    ),
  );
  compat.update(
    compat.get(compat.get(world, "extraction"), "fields"),
    compat.dict([
      ["unitPositions", "extracted"],
      ["unitTypes", "partial"],
      ["militaryClassification", "unavailable"],
    ]),
  );
  compat.append(
    compat.get(compat.get(world, "extraction"), "warnings"),
    "Unit coverage is current plot references; off-map/trade-manager units are not traversed. Unit types and military classification require matching ruleset hashes.",
  );
}
