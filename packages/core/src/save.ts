// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { layout_diagnostics } from "./diagnostics.js";
import { Reader, inflate } from "./binary.js";
export { Reader };
export const ParseError = compat.ParseError;
export let MAX_INPUT: any, MAX_OUTPUT: any, SQLITE_MAGIC: any;
/** Bounded partial parser. Layouts adapted from MIT-licensed layout code; see NOTICE.

Only the initial header is parsed sequentially. Compression and map-header
discovery use validated anchors, not a complete traversal of game state.
 */

MAX_INPUT = compat.mul(compat.mul(64, 1024), 1024);
MAX_OUTPUT = compat.mul(compat.mul(128, 1024), 1024);
SQLITE_MAGIC = compat.bytes([
  83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0,
]);
export function display_player_name(raw: any): any {
  let pos: any;
  /** Use the game's display-name suffix rule without exporting account IDs. */
  pos = compat.rfind(raw, "@");
  if (
    compat.truth(
      compat.and(
        () => compat.compare(0, pos) < 0 && compat.compare(pos, 64) < 0,
        () => compat.compare(compat.sub(compat.len(raw), pos), 32) < 0,
      ),
    )
  ) {
    raw = compat.slice(raw, null, pos, null);
  }
  if (compat.truth(!compat.truth(raw))) {
    return null;
  }
  if (
    compat.truth(
      compat.or(
        () => compat.compare(compat.len(raw), 256) > 0,
        () =>
          compat.any(
            (() => {
              const __v1: any[] = [];
              for (const __v2 of compat.iter(raw)) {
                let c: any = __v2;
                __v1.push(!compat.truth(compat.isprintable(c)));
              }
              return __v1;
            })(),
          ),
      ),
    )
  ) {
    throw new compat.ParseError("invalid player display name");
  }
  return raw;
}
export function read_header(data: any, include_player_names: any = false): any {
  let _: any,
    arrays: any,
    civ: any,
    dst: any,
    header: any,
    identifier: any,
    key: any,
    keys: any,
    leaders: any,
    r: any,
    raw: any,
    roster: any,
    slot: any,
    slot_version: any,
    src: any,
    version: any;
  r = new Reader(data);
  if (compat.truth(!compat.eq(r.take(4), compat.bytes([67, 73, 86, 53])))) {
    throw new compat.ParseError("expected CIV5 signature");
  }
  version = r.unpack("I");
  if (compat.truth(!compat.eq(version, 8))) {
    throw new compat.ParseError(
      "unsupported save header version " +
        compat.format(version, "") +
        "; prototype supports version 8",
    );
  }
  header = compat.dict([
    ["saveVersion", version],
    ["gameVersion", r.string()],
    ["build", r.string()],
    ["turn", r.unpack("I")],
    ["modeId", r.unpack("B")],
  ]);
  compat.put(
    header,
    "mode",
    compat.get(
      compat.dict([
        [0, "singleplayer"],
        [1, "multiplayer"],
        [2, "hotseat"],
      ]),
      compat.get(header, "modeId"),
      "unknown",
    ),
  );
  for (const __v3 of compat.iter([
    "playerCivilizationKey",
    "difficulty",
    "startEra",
    "currentEra",
    "speed",
    "worldSize",
    "mapScript",
  ])) {
    key = __v3;
    compat.put(header, key, r.string());
  }
  compat.put(header, "dlc", []);
  for (const __v4 of compat.iter(compat.range(r.count()))) {
    _ = __v4;
    identifier = compat.hex(r.take(16));
    compat.append(
      compat.get(header, "dlc"),
      compat.dict([
        ["idBytes", identifier],
        ["enabledRaw", r.unpack("I")],
        ["name", r.string()],
      ]),
    );
  }
  compat.put(header, "mods", []);
  for (const __v5 of compat.iter(compat.range(r.count()))) {
    _ = __v5;
    compat.append(
      compat.get(header, "mods"),
      compat.dict([
        ["id", r.string()],
        ["version", r.unpack("I")],
        ["name", r.string()],
      ]),
    );
  }
  for (const __v6 of compat.iter([
    "playerCivilizationName",
    "playerLeaderName",
    "playerColorKey",
  ])) {
    key = __v6;
    compat.put(header, key, r.string());
  }
  r.take(16);
  compat.put(header, "versionString2", r.string());
  r.take(16);
  r.take(4);
  slot_version = r.unpack("I");
  compat.put(header, "slotHintsVersion", slot_version);
  {
    const __v7 = compat.iter([r.unpack("I"), r.unpack("I")]);
    compat.put(header, "speedId", __v7[0]);
    compat.put(header, "worldSizeId", __v7[1]);
  }
  compat.put(header, "mapScript2", r.string());
  arrays = compat.dict([]);
  for (const __v8 of compat.iter([
    "civilizationIds",
    "nicknames",
    "slotStatuses",
    "slotClaims",
    "teams",
    "handicaps",
  ])) {
    key = __v8;
    compat.put(
      arrays,
      key,
      compat.truth(compat.eq(key, "nicknames")) ? r.strings() : r.ints(),
    );
  }
  keys = compat.truth(compat.compare(slot_version, 3) >= 0) ? r.strings() : [];
  leaders = compat.truth(compat.compare(slot_version, 3) >= 0)
    ? r.strings()
    : [];
  compat.put(header, "preGameFormatVersion", r.unpack("I"));
  compat.put(header, "parsedHeaderEnd", r.pos);
  roster = [];
  for (const __v9 of compat.iter(compat.enumerate(keys))) {
    {
      const __v10 = compat.iter(__v9);
      slot = __v10[0];
      key = __v10[1];
    }
    if (compat.truth(!compat.truth(key))) {
      continue;
    }
    civ = compat.dict([
      ["id", slot],
      ["key", key],
      ["name", null],
      ["kind", "unknown"],
      ["color", null],
      ["colorKey", null],
      ["eliminated", null],
    ]);
    if (compat.truth(compat.compare(slot, compat.len(leaders)) < 0)) {
      compat.put(civ, "leaderKey", compat.get(leaders, slot));
    }
    for (const __v11 of compat.iter([
      ["civilizationIds", "rulesetId"],
      ["slotStatuses", "setupSlotStatus"],
      ["teams", "teamId"],
    ])) {
      {
        const __v12 = compat.iter(__v11);
        src = __v12[0];
        dst = __v12[1];
      }
      if (
        compat.truth(
          compat.compare(slot, compat.len(compat.get(arrays, src))) < 0,
        )
      ) {
        compat.put(civ, dst, compat.get(compat.get(arrays, src), slot));
      }
    }
    if (
      compat.truth(
        compat.and(
          () => include_player_names,
          () => compat.has([1, 2], compat.get(header, "modeId")),
        ),
      )
    ) {
      raw = compat.truth(
        compat.compare(slot, compat.len(compat.get(arrays, "nicknames"))) < 0,
      )
        ? compat.get(compat.get(arrays, "nicknames"), slot)
        : "";
      compat.put(civ, "playerName", display_player_name(raw));
    }
    compat.append(roster, civ);
  }
  return [header, roster];
}
export function find_compression(
  data: any,
  minimum: any,
  max_output: any = MAX_OUTPUT,
): any {
  let candidates: any,
    chunks: any,
    cmf: any,
    eof: any,
    flg: any,
    fmt: any,
    marker: any,
    offset: any,
    pos: any,
    r: any,
    size: any,
    sizes: any,
    start: any,
    state: any,
    trailing: any;
  candidates = [];
  for (const __v13 of compat.iter([1, 2])) {
    fmt = __v13;
    marker = compat.struct.pack("<I", fmt);
    start = minimum;
    while (
      compat.truth(
        compat.compare((pos = compat.find(data, marker, start)), 0) >= 0,
      )
    ) {
      start = compat.add(pos, 1);
      if (
        compat.truth(compat.compare(compat.add(pos, 10), compat.len(data)) > 0)
      ) {
        continue;
      }
      size = compat.get(
        compat.struct.unpack_from("<I", data, compat.add(pos, 4)),
        0,
      );
      {
        const __v14 = compat.iter(
          compat.slice(data, compat.add(pos, 8), compat.add(pos, 10), null),
        );
        cmf = __v14[0];
        flg = __v14[1];
      }
      if (
        compat.truth(
          compat.and(
            () =>
              compat.compare(2, size) <= 0 && compat.compare(size, 65536) <= 0,
            () =>
              compat.and(
                () => compat.eq(cmf, 120),
                () =>
                  compat.and(
                    () =>
                      compat.eq(
                        compat.mod(
                          compat.add(compat.shiftLeft(cmf, 8), flg),
                          31,
                        ),
                        0,
                      ),
                    () => !compat.truth(compat.bitAnd(flg, 32)),
                  ),
              ),
          ),
        )
      ) {
        compat.append(candidates, [compat.add(pos, 8), fmt]);
      }
      if (compat.truth(compat.compare(compat.len(candidates), 16) > 0)) {
        throw new compat.ParseError("too many compression candidates");
      }
    }
  }
  if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
    throw new compat.ParseError(
      "expected one compression anchor, found " +
        compat.format(compat.len(candidates), ""),
    );
  }
  {
    const __v15 = compat.iter(compat.get(candidates, 0));
    offset = __v15[0];
    fmt = __v15[1];
  }
  r = new Reader(data, compat.sub(offset, 4));
  {
    const __v16 = compat.iter([[], []]);
    chunks = __v16[0];
    sizes = __v16[1];
  }
  while (compat.truth(compat.compare(r.pos, compat.len(data)) < 0)) {
    size = r.unpack("I");
    if (
      compat.truth(
        !compat.truth(
          compat.compare(1, size) <= 0 && compat.compare(size, 65536) <= 0,
        ),
      )
    ) {
      throw new compat.ParseError(
        "invalid compressed chunk length " +
          compat.format(size, "") +
          " at byte " +
          compat.format(compat.sub(r.pos, 4), ""),
      );
    }
    compat.append(chunks, r.take(size));
    compat.append(sizes, size);
  }
  {
    const __v17 = compat.iter(
      inflate(compat.join(compat.bytes([]), chunks), 0, max_output),
    );
    state = __v17[0];
    eof = __v17[1];
    trailing = __v17[2];
  }
  if (compat.truth(compat.compare(compat.len(state), 24) < 0)) {
    throw new compat.ParseError("compressed state too short");
  }
  return [
    state,
    compat.dict([
      ["offset", offset],
      ["format", fmt],
      ["maxChunkSize", 65536],
      ["chunkCount", compat.len(sizes)],
      ["lastChunkBytes", compat.get(sizes, -1)],
      ["bytes", compat.len(state)],
      ["endMarkerPresent", eof],
      ["trailingBytes", trailing],
      ["sha256", compat.hexdigest(compat.sha256(state))],
    ]),
  ];
}
export function read_map_header(state: any, offset: any): any {
  let _: any,
    count: any,
    flag: any,
    h: any,
    key: any,
    r: any,
    result: any,
    type_hash: any,
    values: any,
    version: any,
    w: any;
  r = new Reader(state, offset);
  version = r.unpack("I");
  if (compat.truth(!compat.eq(version, 1))) {
    throw new compat.ParseError(
      "unsupported map header version " + compat.format(version, ""),
    );
  }
  result = compat.dict([["version", version]]);
  for (const __v18 of compat.iter([
    "width",
    "height",
    "landPlots",
    "ownedPlots",
    "naturalWonders",
    "topLatitude",
    "bottomLatitude",
  ])) {
    key = __v18;
    compat.put(result, key, r.unpack("i"));
  }
  {
    const __v19 = compat.iter([
      compat.get(result, "width"),
      compat.get(result, "height"),
    ]);
    w = __v19[0];
    h = __v19[1];
  }
  if (
    compat.truth(
      !compat.truth(
        compat.and(
          () => compat.compare(1, w) <= 0 && compat.compare(w, 1024) <= 0,
          () =>
            compat.and(
              () => compat.compare(1, h) <= 0 && compat.compare(h, 1024) <= 0,
              () => compat.compare(compat.mul(w, h), 500000) <= 0,
            ),
        ),
      ),
    )
  ) {
    throw new compat.ParseError("implausible map dimensions");
  }
  if (
    compat.truth(
      compat.any(
        (() => {
          const __v20: any[] = [];
          for (const __v21 of compat.iter([
            "landPlots",
            "ownedPlots",
            "naturalWonders",
          ])) {
            let k: any = __v21;
            __v20.push(
              !compat.truth(
                compat.compare(0, compat.get(result, k)) <= 0 &&
                  compat.compare(compat.get(result, k), compat.mul(w, h)) <= 0,
              ),
            );
          }
          return __v20;
        })(),
      ),
    )
  ) {
    throw new compat.ParseError("invalid map aggregate counts");
  }
  if (
    compat.truth(
      !compat.truth(
        compat.compare(-90, compat.get(result, "bottomLatitude")) <= 0 &&
          compat.compare(
            compat.get(result, "bottomLatitude"),
            compat.get(result, "topLatitude"),
          ) <= 0 &&
          compat.compare(compat.get(result, "topLatitude"), 90) <= 0,
      ),
    )
  ) {
    throw new compat.ParseError("invalid map latitudes");
  }
  for (const __v22 of compat.iter(["wrapX", "wrapY"])) {
    key = __v22;
    flag = r.unpack("B");
    if (compat.truth(!compat.has([0, 1], flag))) {
      throw new compat.ParseError("invalid wrapping flag");
    }
    compat.put(result, key, compat.bool(flag));
  }
  compat.put(result, "guidBytes", compat.hex(r.take(16)));
  for (const __v23 of compat.iter(["resourceCounts", "resourceCountsOnLand"])) {
    key = __v23;
    values = [];
    for (const __v24 of compat.iter(compat.range(r.count()))) {
      _ = __v24;
      type_hash = r.unpack("I");
      count = compat.truth(type_hash) ? r.unpack("i") : null;
      if (
        compat.truth(
          compat.and(
            () => count !== null,
            () => compat.compare(count, 0) < 0,
          ),
        )
      ) {
        throw new compat.ParseError("negative resource count");
      }
      compat.append(
        values,
        compat.dict([
          ["typeHash", compat.format(type_hash, "08x")],
          ["count", count],
        ]),
      );
    }
    compat.put(result, key, values);
  }
  {
    const __v25 = compat.iter([offset, r.pos]);
    compat.put(result, "offset", __v25[0]);
    compat.put(result, "endOffset", __v25[1]);
  }
  return result;
}
export function find_map_header(state: any): any {
  let candidates: any,
    header: any,
    page_size: any,
    pages: any,
    pos: any,
    size: any,
    start: any;
  candidates = [];
  start = 4;
  while (
    compat.truth(
      compat.compare((pos = compat.find(state, SQLITE_MAGIC, start)), 0) >= 0,
    )
  ) {
    start = compat.add(pos, 1);
    size = compat.get(
      compat.struct.unpack_from("<I", state, compat.sub(pos, 4)),
      0,
    );
    if (
      compat.truth(
        !compat.truth(
          compat.and(
            () =>
              compat.compare(512, size) <= 0 &&
              compat.compare(size, compat.mul(compat.mul(100, 1024), 1024)) <=
                0,
            () =>
              compat.compare(
                compat.add(compat.add(pos, size), 58),
                compat.len(state),
              ) <= 0,
          ),
        ),
      )
    ) {
      continue;
    }
    page_size = compat.get(
      compat.struct.unpack_from(">H", state, compat.add(pos, 16)),
      0,
    );
    page_size = compat.truth(compat.eq(page_size, 1)) ? 65536 : page_size;
    pages = compat.get(
      compat.struct.unpack_from(">I", state, compat.add(pos, 28)),
      0,
    );
    if (
      compat.truth(
        compat.or(
          () => compat.compare(page_size, 512) < 0,
          () =>
            compat.or(
              () => compat.bitAnd(page_size, compat.sub(page_size, 1)),
              () => !compat.eq(compat.mul(pages, page_size), size),
            ),
        ),
      )
    ) {
      continue;
    }
    try {
      header = read_map_header(state, compat.add(pos, size));
    } catch (__v26) {
      if (__v26 instanceof compat.ParseError) {
        continue;
      } else {
        throw __v26;
      }
    }
    compat.append(candidates, [
      header,
      compat.dict([
        ["offset", pos],
        ["bytes", size],
      ]),
    ]);
  }
  if (compat.truth(!compat.eq(compat.len(candidates), 1))) {
    throw new compat.ParseError(
      "expected one SQLite/map-header anchor, found " +
        compat.format(compat.len(candidates), ""),
    );
  }
  return compat.get(candidates, 0);
}
export function inspect_bytes(
  data: any,
  max_output: any = MAX_OUTPUT,
  include_player_names: any = false,
  diagnostics: any = false,
): any {
  let compression: any,
    database: any,
    fields: any,
    game: any,
    header: any,
    map_header: any,
    result: any,
    roster: any,
    state: any,
    warnings: any;
  if (compat.truth(compat.compare(compat.len(data), MAX_INPUT) > 0)) {
    throw new compat.ParseError(
      "input exceeds " + compat.format(MAX_INPUT, "") + " bytes",
    );
  }
  {
    const __v27 = compat.iter(read_header(data, include_player_names));
    header = __v27[0];
    roster = __v27[1];
  }
  {
    const __v28 = compat.iter(
      find_compression(data, compat.get(header, "parsedHeaderEnd"), max_output),
    );
    state = __v28[0];
    compression = __v28[1];
  }
  warnings = [
    "Current tile and city records are not decoded. This is not a renderable world.",
    "Map header located using a validated SQLite anchor; intervening game sections are not parsed.",
    "Roster IDs are setup player slots, not replay civilization indexes; city-state roster is incomplete.",
  ];
  if (
    compat.truth(!compat.truth(compat.get(compression, "endMarkerPresent")))
  ) {
    compat.append(
      warnings,
      "Zlib end marker absent: common in Civ V saves, but truncation cannot be ruled out.",
    );
  }
  {
    const __v29 = compat.iter([null, null]);
    map_header = __v29[0];
    database = __v29[1];
  }
  try {
    {
      const __v31 = compat.iter(find_map_header(state));
      map_header = __v31[0];
      database = __v31[1];
    }
  } catch (__v30) {
    if (__v30 instanceof compat.ParseError) {
      let exc = __v30;
      compat.append(warnings, compat.str(exc));
    } else {
      throw __v30;
    }
  }
  game = compat.dict([
    ["turn", compat.get(header, "turn")],
    ["width", null],
    ["height", null],
    ["wrapX", null],
    ["wrapY", null],
    ["coordinates", "odd-r-bottom-up"],
  ]);
  if (compat.truth(map_header)) {
    compat.update(
      game,
      (() => {
        const __v32: any[] = [];
        for (const __v33 of compat.iter([
          "width",
          "height",
          "wrapX",
          "wrapY",
        ])) {
          let k: any = __v33;
          __v32.push([k, compat.get(map_header, k)]);
        }
        return compat.dict(__v32);
      })(),
    );
  }
  fields = (() => {
    const __v34: any[] = [];
    for (const __v35 of compat.iter([
      "tileCoordinates",
      "landWater",
      "tileOwnership",
      "cities",
      "terrain",
      "features",
      "rivers",
      "capitals",
      "civilizationColors",
      "historicalOwnership",
    ])) {
      let k: any = __v35;
      __v34.push([k, "unavailable"]);
    }
    return compat.dict(__v34);
  })();
  compat.update(
    fields,
    compat.dict([
      ["turn", "extracted"],
      ["civilizationIds", "partial"],
      ["civilizationNames", "partial"],
      ["mapDimensions", compat.truth(map_header) ? "extracted" : "unavailable"],
      ["wrapping", compat.truth(map_header) ? "extracted" : "unavailable"],
    ]),
  );
  // Newer Lekmod inserts m_iCombatModListLength after the state version.
  // A matching turn only identifies a candidate here. Extraction also checks
  // the corresponding plot layout and city aggregate before accepting it.
  const legacyTurn = compat.get(compat.struct.unpack_from("<I", state, 8), 0);
  const elapsedTurns =
    legacyTurn !== compat.get(header, "turn") &&
    state.length >= 16 &&
    compat.get(compat.struct.unpack_from("<I", state, 12), 0) ===
      compat.get(header, "turn")
      ? compat.get(compat.struct.unpack_from("<I", state, 12), 0)
      : legacyTurn;
  result = compat.dict([
    ["schemaVersion", "0.1"],
    [
      "source",
      compat.dict([
        ["kind", "save"],
        ["sha256", compat.hexdigest(compat.sha256(data))],
      ]),
    ],
    [
      "extraction",
      compat.dict([
        ["status", "partial"],
        ["fields", fields],
        ["warnings", warnings],
      ]),
    ],
    ["game", game],
    ["civilizations", roster],
    ["tiles", null],
    ["cities", null],
    [
      "inspection",
      compat.dict([
        ["header", header],
        ["compression", compression],
        ["mapHeader", map_header],
        ["embeddedDatabase", database],
        ["stateVersion", compat.get(compat.struct.unpack_from("<I", state), 0)],
        ["elapsedTurns", elapsedTurns],
      ]),
    ],
  ]);
  if (compat.truth(diagnostics)) {
    compat.put(
      compat.get(result, "inspection"),
      "layoutDiagnostics",
      layout_diagnostics(state, map_header),
    );
  }
  return [result, state];
}
