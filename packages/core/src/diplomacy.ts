// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { ParseError, Reader } from "./save.js";
/** Bounded current alliance decoding for the two supported save profiles.

Validated player identity/yield anchors establish ownership of MinorCivAI
records. No relationship is inferred from influence, replay or map position.
Unsupported or ambiguous optional records remain unknown.
 */

export function boolean_bytes(r: any, count: any): any {
  let values: any;
  values = r.take(count);
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v1: any[] = [];
          for (const __v2 of compat.iter(values)) {
            let v: any = __v2;
            __v1.push(!compat.has([0, 1], v));
          }
          return __v1;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid diplomacy boolean array");
  }
  return values;
}
export function player_anchors(
  state: any,
  minimum: any,
  yields: any,
  cities: any,
): any {
  let _: any,
    anchors: any,
    city: any,
    conqueror: any,
    founded: any,
    hi: any,
    lo: any,
    marker: any,
    owner: any,
    pos: any,
    r: any;
  marker = compat.struct.pack("<I", yields);
  const identityBytes = yields === 8 ? 36 : 32;
  const yieldVectors = yields === 8 ? 13 : 10;
  {
    const __v3 = compat.iter([[], minimum]);
    anchors = __v3[0];
    pos = __v3[1];
  }
  while (
    compat.truth(
      compat.compare((pos = compat.find(state, marker, pos)), 0) >= 0,
    )
  ) {
    try {
      if (
        compat.truth(
          compat.compare(compat.sub(pos, identityBytes), minimum) < 0,
        )
      ) {
        throw new compat.ParseError("player identity before map end");
      }
      r = new Reader(state, compat.sub(pos, identityBytes));
      boolean_bytes(r, 11);
      founded = r.unpack("i");
      boolean_bytes(r, 3);
      conqueror = r.unpack("i");
      boolean_bytes(r, 2);
      // v17 adds a counted conversion-history vector before the player ID.
      // This observed profile has no entries; populated histories need their
      // own boundary validation before they can establish player intervals.
      if (yields === 8 && r.count() !== 0)
        throw new ParseError("populated conversion history is not supported");
      owner = r.unpack("i");
      r.take(4);
      if (
        compat.truth(
          compat.or(
            () =>
              !compat.truth(
                compat.compare(0, owner) <= 0 && compat.compare(owner, 64) < 0,
              ),
            () =>
              compat.or(
                () =>
                  !compat.truth(
                    compat.compare(0, founded) <= 0 &&
                      compat.compare(founded, 10000) <= 0,
                  ),
                () =>
                  !compat.truth(
                    compat.compare(-1, conqueror) <= 0 &&
                      compat.compare(conqueror, 64) < 0,
                  ),
              ),
          ),
        )
      ) {
        throw new compat.ParseError("invalid player identity");
      }
      for (const __v5 of compat.iter(compat.range(yieldVectors))) {
        _ = __v5;
        if (compat.truth(!compat.eq(r.unpack("I"), yields))) {
          throw new compat.ParseError("invalid player yield-vector size");
        }
        r.take(compat.mul(yields, 4));
      }
      compat.append(
        anchors,
        compat.dict([
          ["id", owner],
          ["offset", compat.sub(pos, identityBytes)],
          ["endOffset", r.pos],
        ]),
      );
    } catch (__v4) {
      if (__v4 instanceof compat.ParseError) {
      } else {
        throw __v4;
      }
    }
    pos = compat.add(pos, 1);
  }
  if (
    compat.truth(
      !compat.eq(
        (() => {
          const __v6: any[] = [];
          for (const __v7 of compat.iter(anchors)) {
            let a: any = __v7;
            __v6.push(compat.get(a, "id"));
          }
          return __v6;
        })(),
        compat.list(compat.range(64)),
      ),
    )
  ) {
    throw new compat.ParseError(
      "expected unique ordered player identity anchors for all 64 slots",
    );
  }
  for (const __v8 of compat.iter(cities)) {
    city = __v8;
    owner = compat.get(city, "owner");
    lo = compat.get(compat.get(anchors, owner), "endOffset");
    hi = compat.truth(compat.compare(owner, 63) < 0)
      ? compat.get(compat.get(anchors, compat.add(owner, 1)), "offset")
      : compat.len(state);
    if (
      compat.truth(
        !compat.truth(
          compat.compare(
            lo,
            compat.get(compat.get(city, "evidence"), "offset"),
          ) <= 0 &&
            compat.compare(
              compat.get(compat.get(city, "evidence"), "offset"),
              compat.get(compat.get(city, "evidence"), "nameEndOffset"),
            ) < 0 &&
            compat.compare(
              compat.get(compat.get(city, "evidence"), "nameEndOffset"),
              hi,
            ) <= 0,
        ),
      )
    ) {
      throw new compat.ParseError(
        "city record conflicts with player identity interval",
      );
    }
  }
  return anchors;
}
export function read_minor_ai(
  state: any,
  offset: any,
  limit: any,
  turn: any,
  extra_arrays: any,
  newer = false,
): any {
  let _: any,
    ally: any,
    bought: any,
    countdown: any,
    end: any,
    enemies: any,
    influence: any,
    personality: any,
    quest: any,
    r: any,
    since: any,
    start: any,
    status: any,
    threatened: any,
    version: any;
  r = new Reader(
    compat.slice(compat.memoryview(state), null, limit, null),
    offset,
  );
  if (compat.truth(!compat.eq(r.unpack("I"), 1))) {
    throw new compat.ParseError("unsupported MinorCivAI version");
  }
  {
    const __v9 = compat.iter([r.unpack("i"), r.unpack("i")]);
    personality = __v9[0];
    status = __v9[1];
  }
  r.take(4);
  {
    const __v12 = compat.iter(
      (() => {
        const __v10: any[] = [];
        for (const __v11 of compat.iter(compat.range(5))) {
          let _: any = __v11;
          __v10.push(r.unpack("i"));
        }
        return __v10;
      })(),
    );
    threatened = __v12[0];
    countdown = __v12[1];
    ally = __v12[2];
    since = __v12[3];
    bought = __v12[4];
  }
  if (
    compat.truth(
      compat.or(
        // Newer Lekmod personalities are database IDs, beyond the four SDK
        // enum values. Their names are not inferred from these integers.
        () => personality < -1 || personality >= (newer ? 4096 : 4),
        () => !compat.has(compat.range(-1, 3), status),
      ),
    )
  ) {
    throw new compat.ParseError("invalid minor personality/status");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.compare(-1, threatened) <= 0 &&
              compat.compare(threatened, 100000) <= 0,
          ),
        () =>
          !compat.truth(
            compat.compare(-1, countdown) <= 0 &&
              compat.compare(countdown, 100000) <= 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid minor counter");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.compare(-1, ally) <= 0 && compat.compare(ally, 22) < 0,
          ),
        () =>
          compat.or(
            () =>
              !compat.truth(
                compat.compare(-1, bought) <= 0 &&
                  compat.compare(bought, 22) < 0,
              ),
            () =>
              !compat.truth(
                compat.compare(-1, since) <= 0 &&
                  compat.compare(since, turn) <= 0,
              ),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid alliance reference/turn");
  }
  if (
    compat.truth(
      compat.and(
        () => !compat.eq(ally, -1),
        () => compat.compare(since, 0) < 0,
      ),
    )
  ) {
    throw new compat.ParseError("alliance has no start turn");
  }
  boolean_bytes(r, 22);
  enemies = compat.struct.unpack(
    "<484i",
    r.take(compat.mul(compat.mul(22, 22), 4)),
  );
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v13: any[] = [];
          for (const __v14 of compat.iter(enemies)) {
            let n: any = __v14;
            __v13.push(
              !compat.truth(
                compat.compare(-1, n) <= 0 && compat.compare(n, 10000) <= 0,
              ),
            );
          }
          return __v13;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid minor enemy matrix");
  }
  boolean_bytes(r, 22);
  r.take(extra_arrays);
  influence = compat.list(
    compat.struct.unpack("<22i", r.take(compat.mul(22, 4))),
  );
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v15: any[] = [];
          for (const __v16 of compat.iter(influence)) {
            let n: any = __v16;
            __v15.push(
              !compat.truth(
                compat.compare(-100000000, n) <= 0 &&
                  compat.compare(n, 100000000) <= 0,
              ),
            );
          }
          return __v15;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid minor influence array");
  }
  r.take(compat.mul(compat.mul(11, 22), 4));
  boolean_bytes(r, compat.add(compat.mul(4, 22), compat.mul(2, 80)));
  for (const __v17 of compat.iter(compat.range(22))) {
    _ = __v17;
    for (const __v18 of compat.iter(compat.range(r.count(128)))) {
      _ = __v18;
      {
        const __v19 = compat.iter([
          r.unpack("I"),
          r.unpack("i"),
          r.unpack("i"),
        ]);
        version = __v19[0];
        quest = __v19[1];
        start = __v19[2];
      }
      r.take(8);
      if (
        compat.truth(
          compat.or(
            () => !compat.has([1, 2], version),
            () =>
              compat.or(
                () =>
                  !compat.truth(
                    compat.compare(0, quest) <= 0 &&
                      compat.compare(quest, 30) <= 0,
                  ),
                () =>
                  !compat.truth(
                    compat.compare(-1, start) <= 0 &&
                      compat.compare(start, turn) <= 0,
                  ),
              ),
          ),
        )
      ) {
        throw new compat.ParseError("invalid minor quest");
      }
      if (compat.truth(compat.eq(version, 2))) {
        boolean_bytes(r, 1);
      }
    }
  }
  boolean_bytes(r, 1);
  if (newer) {
    // The observed eight-yield build saves the per-major religion burst flags.
    // Other optional DLL tails are rejected by the following deal-AI boundary.
    boolean_bytes(r, 22);
  }
  end = r.pos;
  if (compat.truth(!compat.eq(r.unpack("I"), 1))) {
    throw new compat.ParseError("missing following deal-AI boundary");
  }
  return compat.dict([
    ["ally", compat.truth(compat.eq(ally, -1)) ? null : ally],
    ["allianceKnown", true],
    ["allianceSinceTurn", compat.truth(compat.eq(ally, -1)) ? null : since],
    [
      "allianceEvidence",
      compat.dict([
        ["offset", offset],
        ["endOffset", end],
        ["playerIntervalEnd", limit],
      ]),
    ],
  ]);
}
export function add_alliances(world: any, state: any, yields: any): any {
  let anchors: any,
    candidates: any,
    civ: any,
    extra_arrays: any,
    hi: any,
    known: any,
    lo: any,
    majors: any,
    minors: any,
    owner: any,
    pos: any,
    value: any;
  minors = (() => {
    const __v20: any[] = [];
    for (const __v21 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v21;
      if (!compat.truth(compat.eq(compat.get(c, "kind"), "city-state")))
        continue;
      __v20.push(c);
    }
    return __v20;
  })();
  for (const __v22 of compat.iter(minors)) {
    civ = __v22;
    compat.update(
      civ,
      compat.dict([
        ["ally", null],
        ["allianceKnown", false],
      ]),
    );
  }
  if (compat.truth(!compat.truth(minors))) {
    compat.put(
      compat.get(compat.get(world, "extraction"), "fields"),
      "cityStateAlliances",
      "extracted",
    );
    return null;
  }
  try {
    anchors = player_anchors(
      state,
      compat.get(
        compat.get(compat.get(world, "inspection"), "plots"),
        "endOffset",
      ),
      yields,
      compat.get(world, "cities"),
    );
  } catch (__v23) {
    if (__v23 instanceof compat.ParseError) {
      let exc = __v23;
      compat.put(
        compat.get(compat.get(world, "extraction"), "fields"),
        "cityStateAlliances",
        "unavailable",
      );
      compat.append(
        compat.get(compat.get(world, "extraction"), "warnings"),
        "City-state alliances unknown: " + compat.format(exc, ""),
      );
      return null;
    } else {
      throw __v23;
    }
  }
  compat.put(compat.get(world, "inspection"), "playerIdentities", anchors);
  majors = (() => {
    const __v24: any[] = [];
    for (const __v25 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v25;
      if (!compat.truth(compat.eq(compat.get(c, "kind"), "major"))) continue;
      __v24.push(compat.get(c, "id"));
    }
    return compat.set(__v24);
  })();
  extra_arrays = compat.truth(compat.eq(yields, 6))
    ? 0
    : compat.mul(compat.add(compat.mul(2, 63), 22), 4);
  for (const __v26 of compat.iter(minors)) {
    civ = __v26;
    owner = compat.get(civ, "id");
    lo = compat.get(compat.get(anchors, owner), "endOffset");
    hi = compat.truth(compat.compare(owner, 63) < 0)
      ? compat.get(compat.get(anchors, compat.add(owner, 1)), "offset")
      : compat.len(state);
    hi = compat.min(
      compat.add(
        [hi],
        (() => {
          const __v27: any[] = [];
          for (const __v28 of compat.iter(compat.get(world, "cities"))) {
            let c: any = __v28;
            if (!compat.truth(compat.eq(compat.get(c, "owner"), owner)))
              continue;
            __v27.push(compat.get(compat.get(c, "evidence"), "offset"));
          }
          return __v27;
        })(),
      ),
    );
    {
      const __v29 = compat.iter([[], lo]);
      candidates = __v29[0];
      pos = __v29[1];
    }
    while (
      compat.truth(
        compat.compare(
          (pos = compat.find(state, compat.bytes([1, 0, 0, 0]), pos, hi)),
          0,
        ) >= 0,
      )
    ) {
      try {
        value = read_minor_ai(
          state,
          pos,
          hi,
          compat.get(compat.get(world, "game"), "turn"),
          extra_arrays,
          yields === 8,
        );
        if (
          compat.truth(
            compat.and(
              () => compat.get(value, "ally") !== null,
              () => !compat.has(majors, compat.get(value, "ally")),
            ),
          )
        ) {
          throw new compat.ParseError(
            "ally missing from major civilization roster",
          );
        }
        compat.append(candidates, value);
      } catch (__v30) {
        if (__v30 instanceof compat.ParseError) {
        } else {
          throw __v30;
        }
      }
      pos = compat.add(pos, 1);
    }
    if (compat.truth(compat.eq(compat.len(candidates), 1))) {
      compat.update(civ, compat.get(candidates, 0));
    } else {
      compat.append(
        compat.get(compat.get(world, "extraction"), "warnings"),
        "City-state " +
          compat.format(owner, "") +
          " alliance unknown: " +
          compat.format(compat.len(candidates), "") +
          " valid records.",
      );
    }
  }
  known = compat.sum(
    (() => {
      const __v31: any[] = [];
      for (const __v32 of compat.iter(minors)) {
        let c: any = __v32;
        __v31.push(compat.get(c, "allianceKnown"));
      }
      return __v31;
    })(),
  );
  compat.put(
    compat.get(compat.get(world, "extraction"), "fields"),
    "cityStateAlliances",
    compat.truth(compat.eq(known, compat.len(minors)))
      ? "extracted"
      : compat.truth(known)
        ? "partial"
        : "unavailable",
  );
}
