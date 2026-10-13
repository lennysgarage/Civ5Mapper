// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import {
  MAX_INPUT,
  ParseError,
  Reader,
  find_compression,
  read_header,
} from "./save.js";
import { extract_bytes } from "./extract.js";
const PurePosixPath = compat.PurePosixPath;
export let MAX_EVENTS: any, MAX_TILES: any, MAX_TURN: any;
/** Bounded Civ V replay readers, adapted from MIT-licensed layout code (see NOTICE).

Replay IDs index the replay roster; save event IDs are player slots. Event order
within a turn is significant and is preserved. Unknown types remain raw events.
 */

MAX_EVENTS = 500000;
MAX_TILES = 500000;
MAX_TURN = 100000;
export function dimensions(width: any, height: any): any {
  if (
    compat.truth(
      !compat.truth(
        compat.and(
          () =>
            compat.compare(1, width) <= 0 && compat.compare(width, 1024) <= 0,
          () =>
            compat.and(
              () =>
                compat.compare(1, height) <= 0 &&
                compat.compare(height, 1024) <= 0,
              () => compat.compare(compat.mul(width, height), MAX_TILES) <= 0,
            ),
        ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid replay/map dimensions");
  }
}
export function read_events(r: any, extra_bytes: any = 0): any {
  let coordinates: any,
    count: any,
    events: any,
    extra: any,
    index: any,
    kind: any,
    n: any,
    total_tiles: any,
    turn: any;
  count = r.count(MAX_EVENTS);
  if (
    compat.truth(
      compat.compare(
        compat.mul(count, 20),
        compat.sub(compat.len(r.data), r.pos),
      ) > 0,
    )
  ) {
    throw new compat.ParseError("truncated replay event array");
  }
  events = [];
  total_tiles = 0;
  for (const __v1 of compat.iter(compat.range(count))) {
    index = __v1;
    {
      const __v2 = compat.iter([r.unpack("I"), r.unpack("I")]);
      turn = __v2[0];
      kind = __v2[1];
    }
    if (compat.truth(compat.compare(turn, MAX_TURN) > 0)) {
      throw new compat.ParseError("replay turn exceeds limit");
    }
    n = r.count(MAX_TILES);
    total_tiles = compat.add(total_tiles, n);
    if (compat.truth(compat.compare(total_tiles, 2000000) > 0)) {
      throw new compat.ParseError("replay event tile budget exceeded");
    }
    coordinates = (() => {
      const __v3: any[] = [];
      for (const __v4 of compat.iter(compat.range(n))) {
        let _: any = __v4;
        __v3.push(
          compat.dict([
            ["x", r.unpack("H")],
            ["y", r.unpack("H")],
          ]),
        );
      }
      return __v3;
    })();
    extra = (() => {
      const __v5: any[] = [];
      for (const __v6 of compat.iter(
        compat.range(compat.floorDiv(extra_bytes, 4)),
      )) {
        let _: any = __v6;
        __v5.push(r.unpack("i"));
      }
      return __v5;
    })();
    compat.append(
      events,
      compat.dict([
        ["turn", turn],
        ["typeId", kind],
        ["tiles", coordinates],
        ["civId", r.unpack("i")],
        ["text", r.string()],
        ["sequence", index],
      ]),
    );
    if (compat.truth(extra)) {
      compat.put(compat.get(events, -1), "extendedData", extra);
    }
  }
  return events;
}
export function validate_events(
  events: any,
  civs: any,
  width: any = null,
  height: any = null,
  start: any = 0,
  end: any = MAX_TURN,
): any {
  let event: any,
    ids: any,
    kind: any,
    owner: any,
    tile: any,
    turn: any,
    x: any,
    y: any;
  ids = (() => {
    const __v7: any[] = [];
    for (const __v8 of compat.iter(civs)) {
      let c: any = __v8;
      __v7.push(compat.get(c, "id"));
    }
    return compat.set(__v7);
  })();
  for (const __v9 of compat.iter(events)) {
    event = __v9;
    {
      const __v10 = compat.iter([
        compat.get(event, "turn"),
        compat.get(event, "typeId"),
        compat.get(event, "civId"),
      ]);
      turn = __v10[0];
      kind = __v10[1];
      owner = __v10[2];
    }
    if (
      compat.truth(
        compat.or(
          () => compat.type(turn) !== compat.int,
          () =>
            compat.or(
              () =>
                !compat.truth(
                  compat.compare(start, turn) <= 0 &&
                    compat.compare(turn, end) <= 0,
                ),
              () =>
                compat.or(
                  () => compat.type(kind) !== compat.int,
                  () => compat.compare(kind, 0) < 0,
                ),
            ),
        ),
      )
    ) {
      throw new compat.ParseError("invalid replay event turn/type");
    }
    if (
      compat.truth(
        compat.or(
          () => compat.type(owner) !== compat.int,
          () =>
            compat.and(
              () => !compat.eq(owner, -1),
              () => !compat.has(ids, owner),
            ),
        ),
      )
    ) {
      throw new compat.ParseError(
        "replay event references unknown civilization",
      );
    }
    if (
      compat.truth(
        compat.and(
          () => compat.has([1, 2, 3, 4], kind),
          () => !compat.truth(compat.get(event, "tiles")),
        ),
      )
    ) {
      throw new compat.ParseError("political replay event has no tiles");
    }
    if (
      compat.truth(
        !compat.truth(compat.isinstance(compat.get(event, "text"), compat.str)),
      )
    ) {
      throw new compat.ParseError("invalid replay event text");
    }
    for (const __v11 of compat.iter(compat.get(event, "tiles"))) {
      tile = __v11;
      {
        const __v12 = compat.iter([
          compat.get(tile, "x"),
          compat.get(tile, "y"),
        ]);
        x = __v12[0];
        y = __v12[1];
      }
      if (
        compat.truth(
          compat.and(
            () => compat.has([0, 6], kind),
            () => compat.eq([x, y], [65535, 65535]),
          ),
        )
      ) {
        continue;
      }
      if (
        compat.truth(
          compat.or(
            () => compat.type(x) !== compat.int,
            () =>
              compat.or(
                () => compat.type(y) !== compat.int,
                () =>
                  compat.or(
                    () => compat.compare(x, 0) < 0,
                    () =>
                      compat.or(
                        () => compat.compare(y, 0) < 0,
                        () =>
                          compat.and(
                            () => width !== null,
                            () =>
                              compat.or(
                                () => compat.compare(x, width) >= 0,
                                () => compat.compare(y, height) >= 0,
                              ),
                          ),
                      ),
                  ),
              ),
          ),
        )
      ) {
        throw new compat.ParseError(
          "replay event tile (" +
            compat.format(x, "") +
            "," +
            compat.format(y, "") +
            ") outside map",
        );
      }
    }
  }
}
export function result(
  source: any,
  header: any,
  civs: any,
  events: any,
  tiles: any,
  datasets: any = null,
  inspection: any = null,
): any {
  let warnings: any;
  warnings = [
    "Replay reconstructs logged ownership/city changes only; historical capitals, alliances, roads and city populations are unavailable.",
    "Physical geography is a snapshot, not a terrain-change history.",
  ];
  if (compat.truth(tiles === null)) {
    compat.append(
      warnings,
      "No physical tile snapshot extracted; a matching base map is required.",
    );
  }
  return compat.dict([
    ["schemaVersion", "0.1"],
    ["kind", "replay"],
    ["source", source],
    [
      "extraction",
      compat.dict([
        ["status", "complete"],
        [
          "fields",
          compat.dict([
            ["events", "extracted"],
            ["civilizations", "extracted"],
            [
              "datasets",
              compat.truth(datasets !== null) ? "extracted" : "unavailable",
            ],
            [
              "tileGeography",
              compat.truth(tiles !== null) ? "extracted" : "unavailable",
            ],
            ["historicalCapitals", "unavailable"],
            ["historicalRoads", "unavailable"],
          ]),
        ],
        ["warnings", warnings],
      ]),
    ],
    ["game", header],
    ["civilizations", civs],
    ["events", events],
    ["datasets", datasets],
    ["tiles", tiles],
    [
      "inspection",
      compat.or(
        () => inspection,
        () => compat.dict([]),
      ),
    ],
  ]);
}
export function _parse_replay(data: any, extra_bytes: any): any {
  let _: any,
    civ: any,
    civs: any,
    datasets: any,
    entries: any,
    event_offset: any,
    events: any,
    feature: any,
    header: any,
    height: any,
    index: any,
    key: any,
    n: any,
    name: any,
    names: any,
    plot: any,
    points: any,
    r: any,
    rivers: any,
    terrain: any,
    tiles: any,
    values: any,
    width: any;
  if (compat.truth(compat.compare(compat.len(data), MAX_INPUT) > 0)) {
    throw new compat.ParseError("replay exceeds input size limit");
  }
  r = new Reader(data);
  if (
    compat.truth(
      compat.or(
        () => !compat.eq(r.take(4), compat.bytes([67, 73, 86, 53])),
        () => !compat.eq(r.unpack("I"), 1),
      ),
    )
  ) {
    throw new compat.ParseError(
      "unsupported replay file header (requires CIV5/version 1)",
    );
  }
  header = compat.dict([
    ["gameVersion", r.string()],
    ["build", r.string()],
    ["turn", r.unpack("I")],
    ["modeId", r.unpack("B")],
  ]);
  for (const __v13 of compat.iter([
    "playerCivilizationKey",
    "difficulty",
    "startEra",
    "endEra",
    "speed",
    "worldSize",
    "mapFilename",
  ])) {
    key = __v13;
    compat.put(header, key, r.string());
  }
  for (const __v14 of compat.iter(compat.range(r.count()))) {
    _ = __v14;
    r.take(20);
    r.string();
  }
  for (const __v15 of compat.iter(compat.range(r.count()))) {
    _ = __v15;
    r.string();
    r.take(4);
    r.string();
  }
  for (const __v16 of compat.iter([
    "playerCivilizationName",
    "playerLeaderName",
    "playerColorKey",
  ])) {
    key = __v16;
    compat.put(header, key, r.string());
  }
  compat.put(header, "replayVersion", r.unpack("I"));
  compat.put(header, "activePlayerIndex", r.unpack("i"));
  if (compat.truth(!compat.eq(compat.get(header, "replayVersion"), 1))) {
    throw new compat.ParseError(
      "unsupported replay version " +
        compat.format(compat.get(header, "replayVersion"), "") +
        "; requires validated version 1",
    );
  }
  compat.put(header, "mapFilename2", r.string());
  for (const __v17 of compat.iter([
    "worldSizeId",
    "climateId",
    "seaLevelId",
    "eraId",
    "speedId",
  ])) {
    key = __v17;
    compat.put(header, key, r.unpack("I"));
  }
  {
    const __v18 = compat.iter([r.ints(), r.ints()]);
    compat.put(header, "gameOptions", __v18[0]);
    compat.put(header, "victoryTypes", __v18[1]);
  }
  compat.put(header, "victoryAchieved", r.unpack("i"));
  r.take(1);
  {
    const __v19 = compat.iter([r.unpack("I"), r.unpack("i"), r.unpack("I")]);
    compat.put(header, "startTurn", __v19[0]);
    compat.put(header, "startYear", __v19[1]);
    compat.put(header, "endTurn", __v19[2]);
  }
  if (
    compat.truth(
      !compat.truth(
        compat.compare(0, compat.get(header, "startTurn")) <= 0 &&
          compat.compare(
            compat.get(header, "startTurn"),
            compat.get(header, "endTurn"),
          ) <= 0 &&
          compat.compare(compat.get(header, "endTurn"), MAX_TURN) <= 0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid replay turn range");
  }
  compat.put(header, "endYear", r.string());
  r.take(8);
  civs = [];
  for (const __v20 of compat.iter(compat.range(r.count(128)))) {
    index = __v20;
    civ = compat.dict([
      ["id", index],
      ["rulesetId", r.unpack("i")],
      ["leaderTypeId", r.unpack("i")],
      ["playerColorId", r.unpack("i")],
      ["difficultyId", r.unpack("i")],
    ]);
    for (const __v21 of compat.iter([
      "leader",
      "longName",
      "name",
      "demonym",
    ])) {
      key = __v21;
      compat.put(civ, key, r.string());
    }
    compat.update(
      civ,
      compat.dict([
        ["kind", "unknown"],
        ["color", null],
        [
          "key",
          compat.truth(
            compat.startswith(compat.get(civ, "name"), [
              "CIVILIZATION_",
              "MINOR_CIV_",
            ]),
          )
            ? compat.get(civ, "name")
            : null,
        ],
      ]),
    );
    compat.append(civs, civ);
  }
  names = (() => {
    const __v22: any[] = [];
    for (const __v23 of compat.iter(compat.range(r.count(1024)))) {
      let _: any = __v23;
      __v22.push(r.string());
    }
    return __v22;
  })();
  if (
    compat.truth(!compat.eq(compat.len(names), compat.len(compat.set(names))))
  ) {
    throw new compat.ParseError("duplicate replay dataset names");
  }
  datasets = [];
  entries = 0;
  for (const __v24 of compat.iter(compat.range(r.count(128)))) {
    index = __v24;
    if (
      compat.truth(
        compat.or(
          () => compat.compare(index, compat.len(civs)) >= 0,
          () => !compat.eq(r.count(1024), compat.len(names)),
        ),
      )
    ) {
      throw new compat.ParseError("replay dataset roster/category mismatch");
    }
    values = compat.dict([]);
    for (const __v25 of compat.iter(names)) {
      name = __v25;
      n = r.count(compat.add(MAX_TURN, 1));
      entries = compat.add(entries, n);
      if (compat.truth(compat.compare(entries, 4000000) > 0)) {
        throw new compat.ParseError("replay dataset budget exceeded");
      }
      points = (() => {
        const __v26: any[] = [];
        for (const __v27 of compat.iter(compat.range(n))) {
          let _: any = __v27;
          __v26.push(
            compat.dict([
              ["turn", r.unpack("I")],
              ["value", r.unpack("I")],
            ]),
          );
        }
        return __v26;
      })();
      if (
        compat.truth(
          compat.any(
            (() => {
              const __v28: any[] = [];
              for (const __v29 of compat.iter(points)) {
                let p: any = __v29;
                __v28.push(compat.compare(compat.get(p, "turn"), MAX_TURN) > 0);
              }
              return __v28;
            })(),
          ),
        )
      ) {
        throw new compat.ParseError("invalid dataset turn");
      }
      compat.put(values, name, points);
    }
    compat.append(
      datasets,
      compat.dict([
        ["civId", index],
        ["values", values],
      ]),
    );
  }
  r.take(4);
  event_offset = r.pos;
  events = read_events(r, extra_bytes);
  {
    const __v30 = compat.iter([r.unpack("I"), r.unpack("I")]);
    width = __v30[0];
    height = __v30[1];
  }
  dimensions(width, height);
  if (compat.truth(!compat.eq(r.count(MAX_TILES), compat.mul(width, height)))) {
    throw new compat.ParseError(
      "replay physical tile count does not match dimensions",
    );
  }
  tiles = [];
  for (const __v31 of compat.iter(compat.range(compat.mul(width, height)))) {
    index = __v31;
    n = r.count(compat.add(MAX_TURN, 1));
    if (compat.truth(!compat.eq(n, 1))) {
      throw new compat.ParseError(
        "unsupported replay tile history (requires one snapshot per plot)",
      );
    }
    key = r.unpack("I");
    {
      const __v34 = compat.iter(
        (() => {
          const __v32: any[] = [];
          for (const __v33 of compat.iter(compat.range(4))) {
            let _: any = __v33;
            __v32.push(r.unpack("B"));
          }
          return __v32;
        })(),
      );
      plot = __v34[0];
      terrain = __v34[1];
      feature = __v34[2];
      rivers = __v34[3];
    }
    if (
      compat.truth(
        compat.or(
          () => compat.compare(plot, 3) > 0,
          () => !compat.eq(key, compat.get(header, "endTurn")),
        ),
      )
    ) {
      throw new compat.ParseError("invalid replay physical snapshot");
    }
    compat.append(
      tiles,
      compat.dict([
        ["x", compat.mod(index, width)],
        ["y", compat.floorDiv(index, width)],
        ["plotType", plot],
        ["terrainId", terrain],
        ["featureId", compat.truth(compat.eq(feature, 255)) ? null : feature],
        [
          "riverEdges",
          (() => {
            const __v35: any[] = [];
            for (const __v36 of compat.iter([
              [4, "E"],
              [2, "SE"],
              [8, "SW"],
            ])) {
              let [bit, edge] = compat.iter(__v36);
              if (!compat.truth(compat.bitAnd(rivers, bit))) continue;
              __v35.push(edge);
            }
            return __v35;
          })(),
        ],
      ]),
    );
  }
  if (compat.truth(!compat.eq(r.pos, compat.len(data)))) {
    throw new compat.ParseError(
      "unparsed replay trailing bytes: " +
        compat.format(compat.sub(compat.len(data), r.pos), ""),
    );
  }
  compat.update(
    header,
    compat.dict([
      ["width", width],
      ["height", height],
      ["wrapX", null],
      ["wrapY", null],
      ["coordinates", "odd-r-bottom-up"],
    ]),
  );
  validate_events(
    events,
    civs,
    width,
    height,
    compat.get(header, "startTurn"),
    compat.get(header, "endTurn"),
  );
  return result(
    compat.dict([
      ["kind", "replay"],
      ["sha256", compat.hexdigest(compat.sha256(data))],
    ]),
    header,
    civs,
    events,
    tiles,
    datasets,
    compat.dict([
      ["eventsOffset", event_offset],
      ["parsedEnd", r.pos],
      ["datasetNames", names],
      [
        "eventProfile",
        compat.truth(!compat.truth(extra_bytes))
          ? "standard"
          : "lek-extended-12",
      ],
    ]),
  );
}
export function parse_replay(data: any): any {
  let candidate: any, candidates: any, errors: any, extra: any;
  {
    const __v37 = compat.iter([[], []]);
    candidates = __v37[0];
    errors = __v37[1];
  }
  for (const __v38 of compat.iter([0, 12])) {
    extra = __v38;
    try {
      candidate = _parse_replay(data, extra);
      compat.put(
        compat.get(candidate, "inspection"),
        "headerProfile",
        "versioned-1",
      );
      if (compat.truth(!compat.truth(compat.get(candidate, "events")))) {
        compat.put(
          compat.get(candidate, "inspection"),
          "eventProfile",
          "no-events",
        );
        if (
          compat.truth(
            compat.and(
              () => candidates,
              () =>
                !compat.truth(compat.get(compat.get(candidates, 0), "events")),
            ),
          )
        ) {
          continue;
        }
      }
      compat.append(candidates, candidate);
    } catch (__v39) {
      if (__v39 instanceof compat.ParseError) {
        let exc = __v39;
        compat.append(errors, compat.str(exc));
      } else {
        throw __v39;
      }
    }
  }
  if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
    throw new compat.ParseError(
      compat.add(
        "expected one validated replay profile: ",
        compat.join("; ", errors),
      ),
    );
  }
  return compat.get(candidates, 0);
}
export function _save_events(
  state: any,
  timer_bytes: any,
  extra_bytes: any,
): any {
  let _: any,
    events: any,
    flags: any,
    key: any,
    message_version: any,
    offset: any,
    r: any,
    slots: any,
    version: any;
  /** Sequential supported game-state header, through random-state/event records.

    No event-signature scan: unknown headers and nonempty vote lists fail.
     */
  r = new Reader(state);
  version = r.unpack("I");
  if (compat.truth(!compat.eq(version, 1))) {
    throw new compat.ParseError(
      "unsupported embedded replay state version " +
        compat.format(version, "") +
        "; requires validated version 1",
    );
  }
  r.take(compat.mul(29, 4));
  r.take(timer_bytes);
  flags = r.take(10);
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v40: any[] = [];
          for (const __v41 of compat.iter(flags)) {
            let b: any = __v41;
            __v40.push(compat.compare(b, 1) > 0);
          }
          return __v40;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid game-state header flags");
  }
  r.strings();
  r.take(compat.mul(12, 4));
  r.string();
  r.take(compat.mul(compat.mul(7, 64), 4));
  for (const __v42 of compat.iter(compat.range(8))) {
    _ = __v42;
    for (const __v43 of compat.iter(compat.range(r.count(100000)))) {
      _ = __v43;
      if (compat.truth(r.unpack("I"))) {
        r.take(4);
      }
    }
  }
  r.take(compat.mul(compat.mul(3, 63), 4));
  for (const __v44 of compat.iter(compat.range(r.count(100000)))) {
    _ = __v44;
    key = r.unpack("I");
    if (
      compat.truth(
        compat.and(
          () => key,
          () => compat.compare(r.unpack("B"), 1) > 0,
        ),
      )
    ) {
      throw new compat.ParseError("invalid special-unit flag");
    }
  }
  for (const __v45 of compat.iter(compat.range(r.count(100000)))) {
    _ = __v45;
    if (compat.truth(r.unpack("I"))) {
      r.take(compat.mul(4, 5));
    }
  }
  r.strings();
  r.strings();
  for (const __v46 of compat.iter(compat.range(2))) {
    _ = __v46;
    slots = r.unpack("i");
    if (
      compat.truth(
        !compat.truth(
          compat.compare(0, slots) <= 0 && compat.compare(slots, 100000) <= 0,
        ),
      )
    ) {
      throw new compat.ParseError("invalid vote free-list capacity");
    }
    r.take(compat.add(compat.mul(4, 4), compat.mul(slots, 4)));
    if (compat.truth(!compat.eq(r.count(), 0))) {
      throw new compat.ParseError(
        "nonempty vote free-list unsupported for embedded replay",
      );
    }
  }
  for (const __v47 of compat.iter(compat.range(2))) {
    _ = __v47;
    if (compat.truth(!compat.eq(r.unpack("I"), 1))) {
      throw new compat.ParseError("unsupported random-state version");
    }
    r.take(12);
    if (compat.truth(!compat.eq(r.unpack("B"), 0))) {
      throw new compat.ParseError("extended random debugging unsupported");
    }
  }
  message_version = r.unpack("I");
  if (compat.truth(!compat.has([1, 2], message_version))) {
    throw new compat.ParseError("unsupported embedded replay message version");
  }
  offset = r.pos;
  events = read_events(r, extra_bytes);
  return [
    events,
    compat.dict([
      ["stateVersion", version],
      ["messageVersion", message_version],
      ["eventsOffset", offset],
      ["eventsEnd", r.pos],
      ["timerBytes", timer_bytes],
      [
        "eventProfile",
        compat.truth(!compat.truth(extra_bytes))
          ? "standard"
          : "lek-extended-12",
      ],
    ]),
  ];
}
export function save_events(state: any): any {
  let _: any,
    candidate: any,
    candidates: any,
    errors: any,
    extra_bytes: any,
    n: any,
    r: any,
    sessions: any,
    timer_bytes: any,
    x: any,
    y: any;
  {
    const __v48 = compat.iter([[], []]);
    candidates = __v48[0];
    errors = __v48[1];
  }
  for (const __v49 of compat.iter([
    [0, 0],
    [5, 0],
    [9, 0],
    [9, 12],
  ])) {
    {
      const __v50 = compat.iter(__v49);
      timer_bytes = __v50[0];
      extra_bytes = __v50[1];
    }
    try {
      candidate = _save_events(state, timer_bytes, extra_bytes);
      r = new Reader(state, compat.get(compat.get(candidate, 1), "eventsEnd"));
      sessions = r.unpack("i");
      if (
        compat.truth(
          !compat.truth(
            compat.compare(0, sessions) <= 0 &&
              compat.compare(sessions, 1000000) <= 0,
          ),
        )
      ) {
        throw new compat.ParseError("invalid post-replay session count");
      }
      for (const __v52 of compat.iter(compat.range(r.count(100000)))) {
        _ = __v52;
        {
          const __v53 = compat.iter([
            r.unpack("i"),
            r.unpack("i"),
            r.count(32),
          ]);
          x = __v53[0];
          y = __v53[1];
          n = __v53[2];
        }
        if (
          compat.truth(
            compat.or(
              () =>
                !compat.truth(
                  compat.compare(0, x) <= 0 && compat.compare(x, 1024) < 0,
                ),
              () =>
                !compat.truth(
                  compat.compare(0, y) <= 0 && compat.compare(y, 1024) < 0,
                ),
            ),
          )
        ) {
          throw new compat.ParseError("invalid post-replay plot coordinate");
        }
        r.take(compat.mul(n, 4));
      }
      if (compat.truth(!compat.truth(compat.get(candidate, 0)))) {
        compat.put(compat.get(candidate, 1), "eventProfile", "no-events");
        if (
          compat.truth(
            compat.any(
              (() => {
                const __v54: any[] = [];
                for (const __v55 of compat.iter(candidates)) {
                  let c: any = __v55;
                  __v54.push(
                    compat.and(
                      () => !compat.truth(compat.get(c, 0)),
                      () =>
                        compat.eq(
                          compat.get(compat.get(c, 1), "eventsEnd"),
                          compat.get(compat.get(candidate, 1), "eventsEnd"),
                        ),
                    ),
                  );
                }
                return __v54;
              })(),
            ),
          )
        ) {
          continue;
        }
      }
      compat.append(candidates, candidate);
    } catch (__v51) {
      if (__v51 instanceof compat.ParseError) {
        let exc = __v51;
        compat.append(errors, compat.str(exc));
      } else {
        throw __v51;
      }
    }
  }
  if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
    throw new compat.ParseError(
      compat.add(
        "expected one validated embedded replay profile: ",
        compat.join("; ", errors),
      ),
    );
  }
  return compat.get(candidates, 0);
}
export function parse_save_replay(data: any): any {
  let by_id: any,
    c: any,
    civs: any,
    compression: any,
    events: any,
    header: any,
    inspection: any,
    k: any,
    state: any,
    tiles: any,
    world: any;
  if (compat.truth(compat.compare(compat.len(data), MAX_INPUT) > 0)) {
    throw new compat.ParseError("save exceeds input size limit");
  }
  {
    const __v56 = compat.iter(read_header(data, true));
    header = __v56[0];
    civs = __v56[1];
  }
  {
    const __v57 = compat.iter(
      find_compression(data, compat.get(header, "parsedHeaderEnd")),
    );
    state = __v57[0];
    compression = __v57[1];
  }
  {
    const __v58 = compat.iter(save_events(state));
    events = __v58[0];
    inspection = __v58[1];
  }
  validate_events(
    events,
    civs,
    undefined,
    undefined,
    undefined,
    compat.get(header, "turn"),
  );
  compat.update(
    header,
    compat.dict([
      [
        "startTurn",
        compat.fromBytes(compat.slice(state, 12, 16, null), "little"),
      ],
      ["endTurn", compat.get(header, "turn")],
      ["width", null],
      ["height", null],
      ["wrapX", null],
      ["wrapY", null],
      ["coordinates", "odd-r-bottom-up"],
      ["mapFilename", compat.get(header, "mapScript")],
    ]),
  );

  try {
    world = extract_bytes(data);
  } catch (__v59) {
    if (__v59 instanceof compat.ParseError) {
      let exc = __v59;
      world = null;
      compat.put(inspection, "geographyError", compat.str(exc));
    } else {
      throw __v59;
    }
  }
  tiles = null;
  if (compat.truth(world)) {
    compat.update(
      header,
      (() => {
        const __v60: any[] = [];
        for (const __v61 of compat.iter([
          "width",
          "height",
          "wrapX",
          "wrapY",
        ])) {
          let k: any = __v61;
          __v60.push([k, compat.get(compat.get(world, "game"), k)]);
        }
        return compat.dict(__v60);
      })(),
    );
    tiles = (() => {
      const __v62: any[] = [];
      for (const __v63 of compat.iter(compat.get(world, "tiles"))) {
        let t: any = __v63;
        __v62.push(
          (() => {
            const __v64: any[] = [];
            for (const __v65 of compat.iter(compat.items(t))) {
              let [k, v] = compat.iter(__v65);
              if (
                !compat.truth(
                  compat.has(
                    [
                      "x",
                      "y",
                      "landWater",
                      "elevation",
                      "terrain",
                      "terrainId",
                      "feature",
                      "featureHash",
                      "riverEdges",
                    ],
                    k,
                  ),
                )
              )
                continue;
              __v64.push([k, v]);
            }
            return compat.dict(__v64);
          })(),
        );
      }
      return __v62;
    })();
    by_id = (() => {
      const __v66: any[] = [];
      for (const __v67 of compat.iter(compat.get(world, "civilizations"))) {
        let c: any = __v67;
        __v66.push([compat.get(c, "id"), c]);
      }
      return compat.dict(__v66);
    })();
    for (const __v68 of compat.iter(civs)) {
      c = __v68;
      if (compat.truth(compat.has(by_id, compat.get(c, "id")))) {
        compat.update(
          compat.get(by_id, compat.get(c, "id")),
          (() => {
            const __v69: any[] = [];
            for (const __v70 of compat.iter(compat.items(c))) {
              let [k, v] = compat.iter(__v70);
              if (!compat.truth(compat.eq(k, "playerName"))) continue;
              __v69.push([k, v]);
            }
            return compat.dict(__v69);
          })(),
        );
      }
    }
    civs = compat.list(compat.values(by_id));
    for (const __v71 of compat.iter(civs)) {
      c = __v71;
      for (const __v72 of compat.iter([
        "ally",
        "allianceKnown",
        "allianceSinceTurn",
        "allianceEvidence",
        "capitalKnown",
        "capitalCityId",
        "capitalEvidence",
      ])) {
        k = __v72;
        compat.pop(c, k, null);
      }
    }
    validate_events(
      events,
      civs,
      compat.get(header, "width"),
      compat.get(header, "height"),
      compat.get(header, "startTurn"),
      compat.get(header, "endTurn"),
    );
  }
  compat.put(inspection, "compression", compression);
  return result(
    compat.dict([
      ["kind", "save"],
      ["sha256", compat.hexdigest(compat.sha256(data))],
    ]),
    header,
    civs,
    events,
    tiles,
    undefined,
    inspection,
  );
}
export function map_stem(filename: any): any {
  return compat.casefold(
    PurePosixPath(compat.replace(filename, "\\", "/")).stem,
  );
}
