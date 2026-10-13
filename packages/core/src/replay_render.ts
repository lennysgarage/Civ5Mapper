// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { base_world } from "./mapio.js";
import {
  MAX_EVENTS,
  MAX_TURN,
  dimensions,
  map_stem,
  validate_events,
} from "./replay.js";
import {
  DEFAULT_STYLE,
  empire_label,
  render_svg,
  validate_world,
} from "./render.js";
/** Replay event state machine and SVG frames; no binary decoding here. */

export function validate_replay(replay: any): any {
  let game: any, ids: any;
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(compat.get(replay, "schemaVersion", null), "0.1"),
        () => !compat.eq(compat.get(replay, "kind", null), "replay"),
      ),
    )
  ) {
    throw new compat.ParseError("requires CivMapper replay JSON version 0.1");
  }
  if (
    compat.truth(
      !compat.eq(
        compat.get(
          compat.get(replay, "extraction", compat.dict([])),
          "status",
          null,
        ),
        "complete",
      ),
    )
  ) {
    throw new compat.ParseError("replay extraction is incomplete");
  }
  game = compat.get(replay, "game");
  if (
    compat.truth(
      compat.or(
        () => compat.type(compat.get(game, "startTurn")) !== compat.int,
        () =>
          compat.or(
            () => compat.type(compat.get(game, "endTurn")) !== compat.int,
            () =>
              !compat.truth(
                compat.compare(0, compat.get(game, "startTurn")) <= 0 &&
                  compat.compare(
                    compat.get(game, "startTurn"),
                    compat.get(game, "endTurn"),
                  ) <= 0 &&
                  compat.compare(compat.get(game, "endTurn"), MAX_TURN) <= 0,
              ),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid replay turn range");
  }
  ids = (() => {
    const __v1: any[] = [];
    for (const __v2 of compat.iter(compat.get(replay, "civilizations"))) {
      let c: any = __v2;
      __v1.push(compat.get(c, "id"));
    }
    return __v1;
  })();
  if (
    compat.truth(
      compat.or(
        () =>
          compat.any(
            (() => {
              const __v3: any[] = [];
              for (const __v4 of compat.iter(ids)) {
                let i: any = __v4;
                __v3.push(
                  compat.or(
                    () => compat.type(i) !== compat.int,
                    () => compat.compare(i, 0) < 0,
                  ),
                );
              }
              return __v3;
            })(),
          ),
        () =>
          compat.or(
            () => !compat.eq(compat.len(compat.set(ids)), compat.len(ids)),
            () => compat.compare(compat.len(ids), 128) > 0,
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid replay civilization roster");
  }
  if (
    compat.truth(
      compat.or(
        () =>
          !compat.truth(
            compat.isinstance(compat.get(replay, "events"), compat.list),
          ),
        () =>
          compat.compare(compat.len(compat.get(replay, "events")), MAX_EVENTS) >
          0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid replay event array");
  }
  validate_events(
    compat.get(replay, "events"),
    compat.get(replay, "civilizations"),
    compat.get(game, "width", null),
    compat.get(game, "height", null),
    compat.get(game, "startTurn"),
    compat.get(game, "endTurn"),
  );
}
export function prepare(
  replay: any,
  base: any = null,
  map_filename: any = null,
  wrap_x: any = null,
  owner_map: any = null,
): any {
  let b: any,
    c: any,
    candidates: any,
    city: any,
    civs: any,
    expected: any,
    game: any,
    height: any,
    initial_cities: any,
    key: any,
    mapping: any,
    matches: any,
    p: any,
    physical: any,
    plot: any,
    replay_ids: any,
    required: any,
    river_mismatches: any,
    seed_scenario: any,
    t: any,
    tiles: any,
    warnings: any,
    width: any,
    world: any,
    wrap: any;
  validate_replay(replay);
  if (compat.truth(!compat.truth(compat.get(replay, "events")))) {
    throw new compat.ParseError("replay has no events to animate");
  }
  warnings = compat.list(
    compat.get(compat.get(replay, "extraction"), "warnings"),
  );
  game = compat.get(replay, "game");
  if (compat.truth(base !== null)) {
    validate_world(base);
    world = compat.clone(base);
    if (
      compat.truth(
        compat.and(
          () => compat.get(game, "width", null) !== null,
          () =>
            !compat.eq(
              [compat.get(game, "width"), compat.get(game, "height")],
              [
                compat.get(compat.get(world, "game"), "width"),
                compat.get(compat.get(world, "game"), "height"),
              ],
            ),
        ),
      )
    ) {
      throw new compat.ParseError("base map/replay grid dimensions mismatch");
    }
    if (compat.truth(compat.get(replay, "tiles", null) !== null)) {
      physical = (() => {
        const __v5: any[] = [];
        for (const __v6 of compat.iter(compat.get(replay, "tiles"))) {
          let t: any = __v6;
          __v5.push([[compat.get(t, "x"), compat.get(t, "y")], t]);
        }
        return compat.dict(__v5);
      })();
      if (
        compat.truth(
          !compat.eq(
            compat.len(physical),
            compat.len(compat.get(world, "tiles")),
          ),
        )
      ) {
        throw new compat.ParseError(
          "replay physical coordinate coverage mismatch",
        );
      }
      river_mismatches = 0;
      for (const __v7 of compat.iter(compat.get(world, "tiles"))) {
        t = __v7;
        p = compat.get(
          physical,
          [compat.get(t, "x"), compat.get(t, "y")],
          null,
        );
        if (compat.truth(p === null)) {
          throw new compat.ParseError(
            "replay physical coordinate coverage mismatch",
          );
        }
        plot = compat.truth(compat.eq(compat.get(t, "landWater"), "water"))
          ? 3
          : compat.get(
              compat.dict([
                ["mountain", 0],
                ["hills", 1],
                ["flat", 2],
              ]),
              compat.get(t, "elevation", null),
              null,
            );
        expected = compat.get(
          p,
          "plotType",
          compat.truth(compat.eq(compat.get(p, "landWater", null), "water"))
            ? 3
            : compat.get(
                compat.dict([
                  ["mountain", 0],
                  ["hills", 1],
                  ["flat", 2],
                ]),
                compat.get(p, "elevation", null),
                null,
              ),
        );
        if (
          compat.truth(
            compat.or(
              () => !compat.eq(plot, expected),
              () =>
                compat.and(
                  () => compat.get(t, "terrainId", null) !== null,
                  () =>
                    compat.and(
                      () => compat.get(p, "terrainId", null) !== null,
                      () =>
                        !compat.eq(
                          compat.get(t, "terrainId"),
                          compat.get(p, "terrainId"),
                        ),
                    ),
                ),
            ),
          )
        ) {
          throw new compat.ParseError(
            "base map/replay tile geography mismatch at (" +
              compat.format(compat.get(t, "x"), "") +
              "," +
              compat.format(compat.get(t, "y"), "") +
              ")",
          );
        }
        if (
          compat.truth(
            compat.and(
              () => compat.get(t, "riverEdges", null) !== null,
              () =>
                compat.and(
                  () => compat.get(p, "riverEdges", null) !== null,
                  () =>
                    !compat.eq(
                      compat.set(compat.get(t, "riverEdges")),
                      compat.set(compat.get(p, "riverEdges")),
                    ),
                ),
            ),
          )
        ) {
          river_mismatches = compat.add(river_mismatches, 1);
        }
      }
      if (compat.truth(river_mismatches)) {
        compat.append(
          warnings,
          "River snapshots differ on " +
            compat.format(river_mismatches, "") +
            " plots; base-map edges used (upstream warning policy).",
        );
      }
    } else {
      compat.append(
        warnings,
        "Replay lacks geography; only event coordinates can be checked against the base map.",
      );
    }
    if (
      compat.truth(
        compat.and(
          () => map_filename,
          () =>
            compat.and(
              () => compat.get(game, "mapFilename", null),
              () =>
                !compat.eq(
                  map_stem(map_filename),
                  map_stem(compat.get(game, "mapFilename")),
                ),
            ),
        ),
      )
    ) {
      compat.append(
        warnings,
        "Base map filename differs from the recorded map filename; geographic checks still apply.",
      );
    }
  } else {
    if (compat.truth(compat.get(replay, "tiles", null) === null)) {
      throw new compat.ParseError("replay lacks geography; provide --map");
    }
    {
      const __v8 = compat.iter([
        compat.get(game, "width"),
        compat.get(game, "height"),
      ]);
      width = __v8[0];
      height = __v8[1];
    }
    dimensions(width, height);
    wrap = compat.truth(wrap_x === null)
      ? compat.get(game, "wrapX", null)
      : wrap_x;
    if (compat.truth(compat.type(wrap) !== compat.bool)) {
      throw new compat.ParseError(
        "replay files do not record wrapping: provide --map, --wrap-x or --no-wrap-x",
      );
    }
    tiles = [];
    for (const __v9 of compat.iter(compat.get(replay, "tiles"))) {
      p = __v9;
      t = compat.clone(p);
      if (compat.truth(compat.has(t, "plotType"))) {
        compat.update(
          t,
          compat.dict([
            [
              "landWater",
              compat.truth(compat.eq(compat.get(t, "plotType"), 3))
                ? "water"
                : "land",
            ],
            [
              "elevation",
              compat.get(
                compat.dict([
                  [0, "mountain"],
                  [1, "hills"],
                  [2, "flat"],
                  [3, "flat"],
                ]),
                compat.get(t, "plotType"),
              ),
            ],
            ["terrain", null],
          ]),
        );
        compat.pop(t, "featureId", null);
      }
      compat.update(
        t,
        compat.dict([
          ["owner", null],
          ["ownershipKnown", true],
        ]),
      );
      compat.append(tiles, t);
    }
    world = base_world(
      width,
      height,
      wrap,
      tiles,
      compat.clone(compat.get(replay, "source")),
    );
  }
  if (
    compat.truth(
      compat.and(
        () => wrap_x !== null,
        () =>
          compat.and(
            () => base !== null,
            () =>
              !compat.eq(wrap_x, compat.get(compat.get(base, "game"), "wrapX")),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("explicit wrapping conflicts with base map");
  }
  civs = compat.clone(compat.get(replay, "civilizations"));
  for (const __v10 of compat.iter(civs)) {
    c = __v10;
    candidates = (() => {
      const __v11: any[] = [];
      for (const __v12 of compat.iter(compat.get(world, "civilizations"))) {
        let b: any = __v12;
        if (
          !compat.truth(
            compat.or(
              () =>
                compat.and(
                  () => compat.get(c, "minorKey", null),
                  () =>
                    compat.eq(
                      compat.get(b, "minorKey", null),
                      compat.get(c, "minorKey"),
                    ),
                ),
              () =>
                compat.and(
                  () => !compat.truth(compat.get(c, "minorKey", null)),
                  () =>
                    compat.and(
                      () => compat.get(c, "key", null),
                      () =>
                        compat.eq(
                          compat.get(b, "key", null),
                          compat.get(c, "key"),
                        ),
                    ),
                ),
            ),
          )
        )
          continue;
        __v11.push(b);
      }
      return __v11;
    })();
    if (compat.truth(compat.eq(compat.len(candidates), 1))) {
      for (const __v13 of compat.iter(["color", "colorKey", "kind"])) {
        key = __v13;
        if (
          compat.truth(
            compat.get(compat.get(candidates, 0), key, null) !== null,
          )
        ) {
          compat.put(c, key, compat.get(compat.get(candidates, 0), key));
        }
      }
      if (
        compat.truth(
          compat.and(
            () => !compat.truth(compat.get(c, "name", null)),
            () => compat.get(compat.get(candidates, 0), "name", null),
          ),
        )
      ) {
        compat.put(c, "name", compat.get(compat.get(candidates, 0), "name"));
      }
    }
    for (const __v14 of compat.iter([
      "ally",
      "allianceKnown",
      "allianceSinceTurn",
      "capitalKnown",
      "capitalCityId",
      "capitalEvidence",
    ])) {
      key = __v14;
      compat.pop(c, key, null);
    }
    compat.setdefault(c, "kind", "unknown");
    compat.setdefault(c, "color", null);
  }
  initial_cities = [];
  seed_scenario = compat.and(
    () => base !== null,
    () =>
      compat.eq(compat.get(compat.get(base, "source"), "kind", null), "map"),
  );
  if (compat.truth(seed_scenario)) {
    mapping = (() => {
      const __v15: any[] = [];
      for (const __v16 of compat.iter(
        compat.items(
          compat.or(
            () => owner_map,
            () => compat.dict([]),
          ),
        ),
      )) {
        let [k, v] = compat.iter(__v16);
        __v15.push([compat.int(k), v]);
      }
      return compat.dict(__v15);
    })();
    replay_ids = (() => {
      const __v17: any[] = [];
      for (const __v18 of compat.iter(civs)) {
        let c: any = __v18;
        __v17.push(compat.get(c, "id"));
      }
      return compat.set(__v17);
    })();
    for (const __v19 of compat.iter(compat.get(base, "civilizations"))) {
      b = __v19;
      if (compat.truth(!compat.has(mapping, compat.get(b, "id")))) {
        matches = (() => {
          const __v20: any[] = [];
          for (const __v21 of compat.iter(civs)) {
            let c: any = __v21;
            if (
              !compat.truth(
                compat.and(
                  () => compat.get(b, "key", null),
                  () =>
                    compat.has(
                      [
                        compat.get(c, "key", null),
                        compat.get(c, "minorKey", null),
                      ],
                      compat.get(b, "key"),
                    ),
                ),
              )
            )
              continue;
            __v20.push(c);
          }
          return __v20;
        })();
        if (compat.truth(compat.eq(compat.len(matches), 1))) {
          compat.put(
            mapping,
            compat.get(b, "id"),
            compat.get(compat.get(matches, 0), "id"),
          );
        }
      }
    }
    required = (() => {
      const __v22: any[] = [];
      for (const __v23 of compat.iter(compat.get(world, "tiles"))) {
        let t: any = __v23;
        if (!compat.truth(compat.get(t, "owner") !== null)) continue;
        __v22.push(compat.get(t, "owner"));
      }
      return compat.set(__v22);
    })();
    if (
      compat.truth(
        compat.any(
          (() => {
            const __v24: any[] = [];
            for (const __v25 of compat.iter(required)) {
              let o: any = __v25;
              __v24.push(
                compat.or(
                  () => !compat.has(mapping, o),
                  () => !compat.has(replay_ids, compat.get(mapping, o)),
                ),
              );
            }
            return __v24;
          })(),
        ),
      )
    ) {
      throw new compat.ParseError(
        "scenario owners cannot be joined to replay IDs; provide --owner-map JSON with explicit scenario-owner to replay-ID mapping",
      );
    }
    for (const __v26 of compat.iter(compat.get(world, "tiles"))) {
      t = __v26;
      if (compat.truth(compat.get(t, "owner") !== null)) {
        compat.put(t, "owner", compat.get(mapping, compat.get(t, "owner")));
      }
    }
    for (const __v27 of compat.iter(compat.get(world, "cities"))) {
      city = __v27;
      compat.put(city, "owner", compat.get(mapping, compat.get(city, "owner")));
      compat.put(city, "capital", null);
    }
    initial_cities = compat.get(world, "cities");
  }
  compat.put(world, "civilizations", civs);
  compat.put(world, "source", compat.clone(compat.get(replay, "source")));
  compat.put(compat.get(world, "extraction"), "warnings", warnings);
  compat.update(
    compat.get(compat.get(world, "extraction"), "fields"),
    compat.dict([
      ["historicalCapitals", "unavailable"],
      ["historicalRoads", "unavailable"],
      ["historicalAlliances", "unavailable"],
    ]),
  );
  compat.append(
    warnings,
    compat.truth(seed_scenario)
      ? "Scenario map initial politics seed the replay using verified or explicit owner IDs."
      : "Political state starts unclaimed; final-save politics are not seeded into history.",
  );
  for (const __v28 of compat.iter(compat.get(world, "tiles"))) {
    t = __v28;
    if (compat.truth(!compat.truth(seed_scenario))) {
      compat.put(t, "owner", null);
    }
    compat.update(
      t,
      compat.dict([
        ["ownershipKnown", true],
        ["routeKnown", false],
        ["routeId", null],
        ["route", null],
      ]),
    );
    compat.pop(t, "cityReference", null);
  }
  compat.put(world, "cities", initial_cities);
  compat.pop(world, "units", null);
  validate_events(
    compat.get(replay, "events"),
    civs,
    compat.get(compat.get(world, "game"), "width"),
    compat.get(compat.get(world, "game"), "height"),
    compat.get(game, "startTurn"),
    compat.get(game, "endTurn"),
  );
  validate_world(world);
  return [world, warnings];
}
export function* replay_frames(
  replay: any,
  base: any = null,
  maxturns: any = 0,
  map_filename: any = null,
  wrap_x: any = null,
  owner_map: any = null,
): Generator<any> {
  let notes: any, world: any;
  /** One frame per eventful turn; maxturns is a count, matching upstream. */
  for (const __v29 of compat.iter(
    replay_steps(replay, base, maxturns, map_filename, wrap_x, owner_map),
  )) {
    {
      const __v30 = compat.iter(__v29);
      world = __v30[0];
      notes = __v30[1];
    }
    yield world;
  }
}
export function* replay_steps(
  replay: any,
  base: any = null,
  maxturns: any = 0,
  map_filename: any = null,
  wrap_x: any = null,
  owner_map: any = null,
): Generator<any> {
  let cities: any,
    event: any,
    event_notes: any,
    grouped: any,
    kind: any,
    name: any,
    next_id: any,
    notes: any,
    owner: any,
    p: any,
    plots: any,
    pos: any,
    previous: any,
    tile: any,
    turn: any,
    turns: any,
    warnings: any,
    world: any;
  /** Apply events once and emit each world with evidence for major captions. */
  if (
    compat.truth(
      compat.or(
        () => compat.type(maxturns) !== compat.int,
        () => compat.compare(maxturns, 0) < 0,
      ),
    )
  ) {
    throw new compat.ParseError("maxturns must be nonnegative");
  }
  {
    const __v31 = compat.iter(
      prepare(replay, base, map_filename, wrap_x, owner_map),
    );
    world = __v31[0];
    warnings = __v31[1];
  }
  grouped = compat.dict([]);
  for (const __v32 of compat.iter(compat.get(replay, "events"))) {
    event = __v32;
    compat.append(
      compat.setdefault(grouped, compat.get(event, "turn"), []),
      event,
    );
  }
  turns = compat.sorted(grouped);
  if (compat.truth(maxturns)) {
    turns = compat.slice(turns, null, maxturns, null);
  }
  plots = (() => {
    const __v33: any[] = [];
    for (const __v34 of compat.iter(compat.get(world, "tiles"))) {
      let t: any = __v34;
      __v33.push([[compat.get(t, "x"), compat.get(t, "y")], t]);
    }
    return compat.dict(__v33);
  })();
  cities = (() => {
    const __v35: any[] = [];
    for (const __v36 of compat.iter(compat.get(world, "cities"))) {
      let c: any = __v36;
      __v35.push([[compat.get(c, "x"), compat.get(c, "y")], c]);
    }
    return compat.dict(__v35);
  })();
  next_id = 0;
  for (const __v37 of compat.iter(turns)) {
    turn = __v37;
    notes = [];
    for (const __v38 of compat.iter(compat.get(grouped, turn))) {
      event = __v38;
      event_notes = [];
      {
        const __v39 = compat.iter([
          compat.get(event, "typeId"),
          compat.truth(compat.eq(compat.get(event, "civId"), -1))
            ? null
            : compat.get(event, "civId"),
        ]);
        kind = __v39[0];
        owner = __v39[1];
      }
      for (const __v40 of compat.iter(compat.get(event, "tiles"))) {
        p = __v40;
        pos = [compat.get(p, "x"), compat.get(p, "y")];
        if (compat.truth(!compat.has([1, 2, 3, 4], kind))) {
          continue;
        }
        tile = compat.get(plots, pos);
        if (compat.truth(compat.eq(kind, 1))) {
          if (compat.truth(!compat.eq(compat.get(tile, "landWater"), "land"))) {
            throw new compat.ParseError("replay founds a city on water");
          }
          name = compat.removesuffix(compat.get(event, "text"), " is founded.");
          compat.put(
            cities,
            pos,
            compat.dict([
              ["id", "replay:" + compat.format(next_id, "")],
              ["name", name],
              ["x", compat.get(pos, 0)],
              ["y", compat.get(pos, 1)],
              ["owner", compat.get(tile, "owner")],
              ["capital", null],
              ["nameSource", "replay-event-text"],
            ]),
          );
          next_id = compat.add(next_id, 1);
          compat.append(
            event_notes,
            compat.dict([
              ["kind", "founded"],
              ["name", name],
              ["x", compat.get(pos, 0)],
              ["y", compat.get(pos, 1)],
            ]),
          );
        } else {
          if (compat.truth(compat.has([2, 3], kind))) {
            compat.put(tile, "owner", owner);
            if (compat.truth(compat.has(cities, pos))) {
              previous = compat.get(compat.get(cities, pos), "owner");
              if (
                compat.truth(
                  compat.and(
                    () => previous !== null,
                    () => !compat.eq(previous, owner),
                  ),
                )
              ) {
                compat.append(
                  event_notes,
                  compat.dict([
                    ["kind", "ownership"],
                    ["name", compat.get(compat.get(cities, pos), "name")],
                    ["x", compat.get(pos, 0)],
                    ["y", compat.get(pos, 1)],
                    ["previous", previous],
                    ["owner", owner],
                  ]),
                );
              }
              compat.put(compat.get(cities, pos), "owner", owner);
            }
          } else {
            if (compat.truth(compat.has(cities, pos))) {
              compat.append(
                event_notes,
                compat.dict([
                  ["kind", "removed"],
                  ["name", compat.get(compat.get(cities, pos), "name")],
                  ["x", compat.get(pos, 0)],
                  ["y", compat.get(pos, 1)],
                ]),
              );
            }
            compat.put(tile, "owner", null);
            compat.pop(cities, pos, null);
          }
        }
      }
      if (compat.truth(event_notes)) {
        if (compat.truth(compat.strip(compat.get(event, "text")))) {
          compat.append(
            notes,
            compat.dict([["text", compat.get(event, "text")]]),
          );
        } else {
          compat.extend(notes, event_notes);
        }
      }
    }
    compat.put(compat.get(world, "game"), "turn", turn);
    if (
      compat.truth(
        compat.any(
          (() => {
            const __v41: any[] = [];
            for (const __v42 of compat.iter(compat.values(cities))) {
              let c: any = __v42;
              __v41.push(compat.get(c, "owner") === null);
            }
            return __v41;
          })(),
        ),
      )
    ) {
      throw new compat.ParseError(
        "turn " +
          compat.format(turn, "") +
          " has a city without logged ownership; no ownership is guessed",
      );
    }
    compat.put(
      world,
      "cities",
      compat.sorted(
        compat.values(cities),
        compat.dict([
          [
            "key",
            (c: any) => [
              compat.get(c, "y"),
              compat.get(c, "x"),
              compat.get(c, "id"),
            ],
          ],
        ]),
      ),
    );
    validate_world(world);
    yield [compat.clone(world), notes];
  }
}
export function caption_text(notes: any, world: any, style: any = null): any {
  let civs: any, lines: any, mode: any, name: any, note: any;
  /** Use literal messages or descriptions of observed city state transitions. */
  civs = (() => {
    const __v43: any[] = [];
    for (const __v44 of compat.iter(compat.get(world, "civilizations"))) {
      let c: any = __v44;
      __v43.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v43);
  })();
  mode = compat.get(
    compat.or(
      () => style,
      () => compat.dict([]),
    ),
    "empireLabels",
    compat.get(DEFAULT_STYLE, "empireLabels"),
  );
  function owner_name(owner: any): any {
    return compat.truth(owner === null)
      ? "unclaimed"
      : empire_label(compat.get(civs, owner), mode);
  }
  lines = [];
  for (const __v45 of compat.iter(notes)) {
    note = __v45;
    if (compat.truth(compat.has(note, "text"))) {
      compat.append(lines, compat.get(note, "text"));
      continue;
    }
    name = compat.or(
      () => compat.get(note, "name"),
      () =>
        "(" +
        compat.format(compat.get(note, "x"), "") +
        "," +
        compat.format(compat.get(note, "y"), "") +
        ")",
    );
    if (compat.truth(compat.eq(compat.get(note, "kind"), "founded"))) {
      compat.append(lines, "City founded: " + compat.format(name, "") + ".");
    } else {
      if (compat.truth(compat.eq(compat.get(note, "kind"), "ownership"))) {
        compat.append(
          lines,
          "Ownership changed: " +
            compat.format(name, "") +
            " \u2014 " +
            compat.format(owner_name(compat.get(note, "previous")), "") +
            " \u2192 " +
            compat.format(owner_name(compat.get(note, "owner")), "") +
            ".",
        );
      } else {
        compat.append(lines, "City removed: " + compat.format(name, "") + ".");
      }
    }
  }
  return lines;
}
