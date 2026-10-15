// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { boolean_bytes, player_anchors } from "./diplomacy.js";
import { ParseError, Reader } from "./save.js";
export let PLAYER_PROFILES: any;
/** Current capital references from validated, empirical player-prefix profiles.

These offsets belong to the tested layouts, not arbitrary DLL compatibility.
A current owner/local city ID must join a decoded city. Historical flags,
original capital coordinates and founding order never choose the capital.
 */

PLAYER_PROFILES = compat.dict([
  [
    "bnw-six-yield",
    compat.dict([
      ["prefixBytes", 908],
      ["capitalBack", 257],
      ["tailInts", 64],
      ["originalXIndex", 39],
      ["trailerBooleans", 1],
      ["yields", 6],
    ]),
  ],
  [
    "observed-seven-yield",
    compat.dict([
      ["prefixBytes", 1050],
      ["capitalBack", 262],
      ["tailInts", 65],
      ["originalXIndex", 40],
      ["trailerBooleans", 2],
      ["yields", 7],
    ]),
  ],
  [
    "observed-eight-yield",
    compat.dict([
      ["prefixBytes", 1046],
      ["capitalBack", 262],
      ["tailInts", 65],
      ["originalXIndex", 40],
      ["trailerBooleans", 2],
      ["yields", 8],
      ["playerVersion", 17],
    ]),
  ],
]);
export function read_capital(
  state: any,
  anchor: any,
  profile: any,
  world: any,
): any {
  let alive: any,
    cities: any,
    current: any,
    height: any,
    identity: any,
    land: any,
    local_id: any,
    matches: any,
    offset: any,
    ox: any,
    oy: any,
    population: any,
    r: any,
    scored: any,
    start: any,
    starting_valid: any,
    sx: any,
    sy: any,
    tail: any,
    width: any;
  identity = compat.get(anchor, "offset");
  start = compat.sub(identity, compat.get(profile, "prefixBytes"));
  if (
    compat.truth(
      compat.compare(
        start,
        compat.get(
          compat.get(compat.get(world, "inspection"), "plots"),
          "endOffset",
        ),
      ) < 0,
    )
  ) {
    throw new compat.ParseError("player prefix overlaps plots");
  }
  r = new Reader(state, start);
  if (
    compat.truth(
      !compat.eq(r.unpack("I"), compat.get(profile, "playerVersion", 16)),
    )
  ) {
    throw new compat.ParseError("unsupported capital player version");
  }
  {
    const __v3 = compat.iter(
      (() => {
        const __v1: any[] = [];
        for (const __v2 of compat.iter(compat.range(5))) {
          let _: any = __v2;
          __v1.push(r.unpack("i"));
        }
        return __v1;
      })(),
    );
    sx = __v3[0];
    sy = __v3[1];
    population = __v3[2];
    land = __v3[3];
    scored = __v3[4];
  }
  {
    const __v4 = compat.iter([
      compat.get(compat.get(world, "game"), "width"),
      compat.get(compat.get(world, "game"), "height"),
    ]);
    width = __v4[0];
    height = __v4[1];
  }
  starting_valid = compat.or(
    () =>
      compat.and(
        () => compat.compare(-1, sx) <= 0 && compat.compare(sx, width) < 0,
        () => compat.compare(-1, sy) <= 0 && compat.compare(sy, height) < 0,
      ),
    () => compat.eq([sx, sy], [-2147483647, -2147483647]),
  );
  if (
    compat.truth(
      !compat.truth(
        compat.and(
          () => starting_valid,
          () =>
            compat.compare(0, scored) <= 0 &&
            compat.compare(scored, compat.mul(width, height)) <= 0,
        ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid player-prefix coordinates/count");
  }
  cities = (() => {
    const __v5: any[] = [];
    for (const __v6 of compat.iter(compat.get(world, "cities"))) {
      let c: any = __v6;
      if (
        !compat.truth(
          compat.eq(compat.get(c, "owner"), compat.get(anchor, "id")),
        )
      )
        continue;
      __v5.push(c);
    }
    return __v5;
  })();
  if (
    compat.truth(
      !compat.eq(
        population,
        compat.sum(
          (() => {
            const __v7: any[] = [];
            for (const __v8 of compat.iter(cities)) {
              let c: any = __v8;
              __v7.push(compat.get(c, "population"));
            }
            return __v7;
          })(),
        ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "player population does not match current cities",
    );
  }
  if (
    compat.truth(
      !compat.eq(
        land,
        compat.sum(
          (() => {
            const __v9: any[] = [];
            for (const __v10 of compat.iter(compat.get(world, "tiles"))) {
              let t: any = __v10;
              __v9.push(
                compat.and(
                  () =>
                    compat.eq(compat.get(t, "owner"), compat.get(anchor, "id")),
                  () => compat.eq(compat.get(t, "landWater"), "land"),
                ),
              );
            }
            return __v9;
          })(),
        ),
      ),
    )
  ) {
    throw new compat.ParseError("player land does not match current plots");
  }
  offset = compat.sub(identity, compat.get(profile, "capitalBack"));
  r = new Reader(state, offset);
  tail = compat.list(
    compat.struct.unpack(
      compat.add(
        compat.add("<", compat.str(compat.get(profile, "tailInts"))),
        "i",
      ),
      r.take(compat.mul(compat.get(profile, "tailInts"), 4)),
    ),
  );
  boolean_bytes(r, compat.get(profile, "trailerBooleans"));
  if (compat.truth(!compat.eq(r.pos, identity))) {
    throw new compat.ParseError(
      "capital tail does not meet player identity boundary",
    );
  }
  {
    const __v11 = compat.iter(
      compat.slice(
        tail,
        compat.get(profile, "originalXIndex"),
        compat.add(compat.get(profile, "originalXIndex"), 2),
        null,
      ),
    );
    ox = __v11[0];
    oy = __v11[1];
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.compare(-1, ox) <= 0 && compat.compare(ox, width) < 0,
          ),
        () =>
          compat.or(
            () =>
              !compat.truth(
                compat.compare(-1, oy) <= 0 && compat.compare(oy, height) < 0,
              ),
            () =>
              !compat.truth(
                compat.compare(-1, compat.get(tail, 4)) <= 0 &&
                  compat.compare(
                    compat.get(tail, 4),
                    compat.get(compat.get(world, "game"), "turn"),
                  ) <= 0,
              ),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid capital-tail coordinates/turn");
  }
  alive = compat.get(state, compat.add(identity, 1));
  local_id = compat.get(tail, 0);
  if (compat.truth(compat.compare(local_id, -1) < 0)) {
    throw new compat.ParseError("invalid current capital local ID");
  }
  matches = (() => {
    const __v12: any[] = [];
    for (const __v13 of compat.iter(cities)) {
      let c: any = __v13;
      if (!compat.truth(compat.eq(compat.get(c, "localId"), local_id)))
        continue;
      __v12.push(c);
    }
    return __v12;
  })();
  if (
    compat.truth(
      compat.and(
        () => cities,
        () =>
          compat.or(
            () => !compat.eq(alive, 1),
            () => !compat.eq(compat.len(matches), 1),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "capital reference does not uniquely match a current owned city",
    );
  }
  if (
    compat.truth(
      compat.and(
        () => !compat.truth(cities),
        () =>
          compat.and(
            () => compat.eq(alive, 1),
            () => !compat.eq(local_id, -1),
          ),
      ),
    )
  ) {
    throw new compat.ParseError(
      "living player has an unresolved capital reference",
    );
  }
  current = compat.truth(matches) ? compat.get(matches, 0) : null;
  return compat.dict([
    ["capitalKnown", true],
    ["capitalCityId", compat.truth(current) ? compat.get(current, "id") : null],
    [
      "capitalEvidence",
      compat.dict([
        ["playerPrefixOffset", start],
        ["referenceOffset", offset],
        ["identityOffset", identity],
        ["storedLocalId", local_id],
        ["playerAlive", compat.bool(alive)],
      ]),
    ],
  ]);
}
export function add_capitals(world: any, state: any, profile_name: any): any {
  let anchors: any, city: any, civ: any, info: any, known: any, profile: any;
  profile = compat.get(PLAYER_PROFILES, profile_name, null);
  for (const __v14 of compat.iter(compat.get(world, "civilizations"))) {
    civ = __v14;
    compat.update(
      civ,
      compat.dict([
        ["capitalKnown", false],
        ["capitalCityId", null],
      ]),
    );
  }
  try {
    if (profile === null)
      throw new ParseError(
        "player capital layout has not been validated for " + profile_name,
      );
    anchors = compat.get(
      compat.get(world, "inspection"),
      "playerIdentities",
      null,
    );
    if (compat.truth(anchors === null)) {
      anchors = player_anchors(
        state,
        compat.get(
          compat.get(compat.get(world, "inspection"), "plots"),
          "endOffset",
        ),
        compat.get(profile, "yields"),
        compat.get(world, "cities"),
      );
      compat.put(compat.get(world, "inspection"), "playerIdentities", anchors);
    }
  } catch (__v15) {
    if (__v15 instanceof compat.ParseError) {
      let exc = __v15;
      compat.put(
        compat.get(compat.get(world, "extraction"), "fields"),
        "capitals",
        "unavailable",
      );
      compat.append(
        compat.get(compat.get(world, "extraction"), "warnings"),
        "Current capitals unknown: " + compat.format(exc, ""),
      );
      return null;
    } else {
      throw __v15;
    }
  }
  known = 0;
  for (const __v16 of compat.iter(compat.get(world, "civilizations"))) {
    civ = __v16;
    try {
      info = read_capital(
        state,
        compat.get(anchors, compat.get(civ, "id")),
        profile,
        world,
      );
    } catch (__v17) {
      if (__v17 instanceof compat.ParseError) {
        let exc = __v17;
        compat.append(
          compat.get(compat.get(world, "extraction"), "warnings"),
          "Player " +
            compat.format(compat.get(civ, "id"), "") +
            " capital unknown: " +
            compat.format(exc, ""),
        );
        continue;
      } else {
        throw __v17;
      }
    }
    compat.update(civ, info);
    known = compat.add(known, 1);
    for (const __v18 of compat.iter(compat.get(world, "cities"))) {
      city = __v18;
      if (
        compat.truth(
          compat.eq(compat.get(city, "owner"), compat.get(civ, "id")),
        )
      ) {
        compat.put(
          city,
          "capital",
          compat.eq(compat.get(city, "id"), compat.get(info, "capitalCityId")),
        );
      }
    }
  }
  compat.put(
    compat.get(compat.get(world, "extraction"), "fields"),
    "capitals",
    compat.truth(
      compat.eq(known, compat.len(compat.get(world, "civilizations"))),
    )
      ? "extracted"
      : compat.truth(known)
        ? "partial"
        : "unavailable",
  );
}
