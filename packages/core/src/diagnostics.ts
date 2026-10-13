// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
import { ParseError } from "./save.js";
import { PROFILES, read_plots } from "./extract.js";
/** Evidence-only layout diagnostics; candidates never become extracted facts. */

export function layout_diagnostics(state: any, header: any): any {
  let city_refs: any,
    evidence: any,
    limit: any,
    local_id: any,
    marker: any,
    name: any,
    offset: any,
    pos: any,
    profile: any,
    report: any,
    start: any,
    tile: any,
    tiles: any,
    version: any,
    versions: any,
    x: any,
    y: any;
  report = compat.dict([
    ["plotVersion", null],
    ["plotVersionOffset", null],
    ["cityVersionCandidates", []],
    ["yieldCountCandidates", []],
    ["profileAttempts", []],
    [
      "warning",
      "Unvalidated byte-pattern candidates are research hints, not decoded game fields.",
    ],
  ]);
  if (compat.truth(header === null)) {
    return report;
  }
  offset = compat.get(header, "endOffset");
  if (
    compat.truth(compat.compare(compat.add(offset, 4), compat.len(state)) <= 0)
  ) {
    compat.update(
      report,
      compat.dict([
        [
          "plotVersion",
          compat.get(compat.struct.unpack_from("<I", state, offset), 0),
        ],
        ["plotVersionOffset", offset],
      ]),
    );
  }

  start = offset;
  city_refs = [];
  for (const __v1 of compat.iter(compat.items(PROFILES))) {
    {
      const __v2 = compat.iter(__v1);
      name = __v2[0];
      profile = __v2[1];
    }
    try {
      {
        const __v4 = compat.iter(read_plots(state, header, profile));
        tiles = __v4[0];
        evidence = __v4[1];
      }
      city_refs = (() => {
        const __v5: any[] = [];
        for (const __v6 of compat.iter(tiles)) {
          let t: any = __v6;
          if (!compat.truth(compat.get(t, "cityReference", null))) continue;
          __v5.push(t);
        }
        return __v5;
      })();
      compat.append(
        compat.get(report, "profileAttempts"),
        compat.dict([
          ["profile", name],
          ["status", "validated-plots"],
          ["endOffset", compat.get(evidence, "endOffset")],
        ]),
      );
      compat.append(
        compat.get(report, "yieldCountCandidates"),
        compat.dict([
          ["count", compat.get(profile, "yields")],
          ["profile", name],
          ["evidence", "full plot-grid validation"],
        ]),
      );
      start = compat.get(evidence, "endOffset");
    } catch (__v3) {
      if (__v3 instanceof compat.ParseError) {
        let exc = __v3;
        compat.append(
          compat.get(report, "profileAttempts"),
          compat.dict([
            ["profile", name],
            ["status", "rejected"],
            ["error", compat.str(exc)],
          ]),
        );
      } else {
        throw __v3;
      }
    }
  }
  limit = compat.min(
    compat.sub(compat.len(state), 16),
    compat.add(start, compat.mul(compat.mul(16, 1024), 1024)),
  );
  versions = compat.set();
  if (compat.truth(city_refs)) {
    for (const __v7 of compat.iter(compat.slice(city_refs, null, 32, null))) {
      tile = __v7;
      marker = compat.struct.pack(
        "<iii",
        compat.get(compat.get(tile, "cityReference"), "localId"),
        compat.get(tile, "x"),
        compat.get(tile, "y"),
      );
      pos = compat.add(start, 4);
      while (
        compat.truth(
          compat.compare((pos = compat.find(state, marker, pos, limit)), 0) >=
            0,
        )
      ) {
        version = compat.get(
          compat.struct.unpack_from("<I", state, compat.sub(pos, 4)),
          0,
        );
        if (
          compat.truth(
            compat.compare(1, version) <= 0 &&
              compat.compare(version, 65535) <= 0,
          )
        ) {
          compat.append(
            compat.get(report, "cityVersionCandidates"),
            compat.dict([
              ["version", version],
              ["offset", compat.sub(pos, 4)],
              [
                "evidence",
                "plot city-reference ID/coordinate match; version unvalidated",
              ],
            ]),
          );
          compat.add(versions, version);
        }
        pos = compat.add(pos, 1);
        if (
          compat.truth(
            compat.compare(
              compat.len(compat.get(report, "cityVersionCandidates")),
              32,
            ) >= 0,
          )
        ) {
          break;
        }
      }
      if (
        compat.truth(
          compat.compare(
            compat.len(compat.get(report, "cityVersionCandidates")),
            32,
          ) >= 0,
        )
      ) {
        break;
      }
    }
    compat.sort(
      compat.get(report, "cityVersionCandidates"),
      compat.dict([["key", (c: any) => compat.get(c, "offset")]]),
    );
    compat.put(report, "cityVersionsObserved", compat.sorted(versions));
    return report;
  }
  for (const __v8 of compat.iter(compat.range(1, 17))) {
    version = __v8;
    marker = compat.struct.pack("<I", version);
    pos = start;
    while (
      compat.truth(
        compat.compare((pos = compat.find(state, marker, pos, limit)), 0) >= 0,
      )
    ) {
      if (
        compat.truth(
          compat.compare(
            compat.len(compat.get(report, "cityVersionCandidates")),
            32,
          ) >= 0,
        )
      ) {
        break;
      }
      {
        const __v9 = compat.iter(
          compat.struct.unpack_from("<iii", state, compat.add(pos, 4)),
        );
        local_id = __v9[0];
        x = __v9[1];
        y = __v9[2];
      }
      if (
        compat.truth(
          compat.and(
            () =>
              compat.compare(8192, local_id) <= 0 &&
              compat.compare(local_id, 536870911) <= 0,
            () =>
              compat.and(
                () =>
                  compat.compare(0, x) <= 0 &&
                  compat.compare(x, compat.get(header, "width")) < 0,
                () =>
                  compat.compare(0, y) <= 0 &&
                  compat.compare(y, compat.get(header, "height")) < 0,
              ),
          ),
        )
      ) {
        compat.append(
          compat.get(report, "cityVersionCandidates"),
          compat.dict([
            ["version", version],
            ["offset", pos],
            ["evidence", "unvalidated version/id/coordinate prefix"],
          ]),
        );
        compat.add(versions, version);
      }
      pos = compat.add(pos, 1);
    }
    if (
      compat.truth(
        compat.compare(
          compat.len(compat.get(report, "cityVersionCandidates")),
          32,
        ) >= 0,
      )
    ) {
      break;
    }
  }
  compat.sort(
    compat.get(report, "cityVersionCandidates"),
    compat.dict([["key", (c: any) => compat.get(c, "offset")]]),
  );
  compat.put(report, "cityVersionsObserved", compat.sorted(versions));
  return report;
}
