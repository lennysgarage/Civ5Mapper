// Direct TypeScript port of validated algorithms. MIT; see NOTICE.
import * as compat from "./compat.js";
export let COMBAT_ROLES: any, DOMAIN_ROLES: any, ROLE_LABELS: any;
/** Presentation categories from resolved ruleset keys; no unit-name guessing. */

COMBAT_ROLES = compat.dict([
  ["UNITCOMBAT_MELEE", "infantry"],
  ["UNITCOMBAT_GUN", "infantry"],
  ["UNITCOMBAT_PARADROPPER", "infantry"],
  ["UNITCOMBAT_ARCHER", "ranged"],
  ["UNITCOMBAT_MOUNTED", "cavalry"],
  ["UNITCOMBAT_MOUNTED_RANGED", "mounted-ranged"],
  ["UNITCOMBAT_SIEGE", "artillery"],
  ["UNITCOMBAT_ARMOR", "armor"],
  ["UNITCOMBAT_RECON", "recon"],
  ["UNITCOMBAT_NAVALMELEE", "naval-melee"],
  ["UNITCOMBAT_NAVALRANGED", "naval-ranged"],
  ["UNITCOMBAT_SUBMARINE", "submarine"],
  ["UNITCOMBAT_CARRIER", "carrier"],
  ["UNITCOMBAT_FIGHTER", "fighter"],
  ["UNITCOMBAT_BOMBER", "bomber"],
  ["UNITCOMBAT_HELICOPTER", "helicopter"],
  ["UNITCOMBAT_NUKE", "nuclear"],
]);
ROLE_LABELS = compat.dict([
  ["infantry", "Infantry / melee"],
  ["ranged", "Ranged troops"],
  ["cavalry", "Cavalry"],
  ["mounted-ranged", "Mounted ranged"],
  ["artillery", "Artillery / siege"],
  ["armor", "Armor"],
  ["recon", "Recon"],
  ["naval-melee", "Naval melee"],
  ["naval-ranged", "Naval ranged"],
  ["submarine", "Submarines"],
  ["carrier", "Carriers"],
  ["fighter", "Fighters"],
  ["bomber", "Bombers"],
  ["helicopter", "Helicopters"],
  ["airship", "Airships"],
  ["nuclear", "Nuclear units"],
  ["missile", "Missiles"],
  ["land", "Other land units"],
  ["naval", "Other naval units"],
  ["air", "Other air units"],
  ["generic", "Other units"],
]);
DOMAIN_ROLES = compat.dict([
  ["DOMAIN_LAND", "land"],
  ["DOMAIN_SEA", "naval"],
  ["DOMAIN_AIR", "air"],
]);
export function military_role(unit: any): any {
  if (
    compat.truth(
      compat.eq(compat.get(unit, "unitClass", null), "UNITCLASS_AIRSHIP"),
    )
  ) {
    return "airship";
  }
  if (
    compat.truth(
      compat.eq(
        compat.get(unit, "unitClass", null),
        "UNITCLASS_GUIDED_MISSILE",
      ),
    )
  ) {
    return "missile";
  }
  return compat.get(
    COMBAT_ROLES,
    compat.get(unit, "combatClass", null),
    compat.get(DOMAIN_ROLES, compat.get(unit, "domain"), "generic"),
  );
}
export function military_summary(civilizations: any, groups: any): any {
  let by_id: any, counts: any, owner: any, units: any, x: any, y: any;
  /** Count exactly the validated major military units used for map markers. */
  counts = (() => {
    const __v1: any[] = [];
    for (const __v2 of compat.iter(civilizations)) {
      let c: any = __v2;
      if (!compat.truth(compat.eq(compat.get(c, "kind"), "major"))) continue;
      __v1.push([compat.get(c, "id"), compat.Counter()]);
    }
    return compat.dict(__v1);
  })();
  for (const __v3 of compat.iter(compat.items(groups))) {
    {
      const __v4 = compat.iter(__v3);
      {
        const __v5 = compat.iter(__v4[0]);
        owner = __v5[0];
        x = __v5[1];
        y = __v5[2];
      }
      units = __v4[1];
    }
    compat.update(
      compat.get(counts, owner),
      (() => {
        const __v6: any[] = [];
        for (const __v7 of compat.iter(units)) {
          let u: any = __v7;
          __v6.push(military_role(u));
        }
        return __v6;
      })(),
    );
  }
  by_id = (() => {
    const __v8: any[] = [];
    for (const __v9 of compat.iter(civilizations)) {
      let c: any = __v9;
      __v8.push([compat.get(c, "id"), c]);
    }
    return compat.dict(__v8);
  })();
  return (() => {
    const __v10: any[] = [];
    for (const __v11 of compat.iter(compat.sorted(counts))) {
      let owner: any = __v11;
      if (
        !compat.truth(
          compat.or(
            () => compat.get(counts, owner),
            () =>
              compat.and(
                () =>
                  compat.get(
                    compat.or(
                      () =>
                        compat.get(
                          compat.get(by_id, owner),
                          "capitalEvidence",
                          null,
                        ),
                      () => compat.dict([]),
                    ),
                    "playerAlive",
                    null,
                  ) !== false,
                () =>
                  compat.get(compat.get(by_id, owner), "eliminated", null) !==
                  true,
              ),
          ),
        )
      )
        continue;
      __v10.push(
        compat.dict([
          ["owner", owner],
          ["total", compat.sum(compat.values(compat.get(counts, owner)))],
          [
            "categories",
            (() => {
              const __v12: any[] = [];
              for (const __v13 of compat.iter(ROLE_LABELS)) {
                let role: any = __v13;
                if (!compat.truth(compat.get(compat.get(counts, owner), role)))
                  continue;
                __v12.push([role, compat.get(compat.get(counts, owner), role)]);
              }
              return compat.dict(__v12);
            })(),
          ],
        ]),
      );
    }
    return __v10;
  })();
}
export function detailed_symbol(role: any): any {
  let paths: any;
  /** Small SVG paths in a -8..8 coordinate box. */
  paths = compat.dict([
    ["infantry", "M-6,5 L4,-5 L5,-8 L2,-7 L-8,3 M-6,1 L-2,5"],
    ["ranged", "M-4,-7 Q8,0 -4,7 Z M-7,0 H6 M2,-3 L6,0 L2,3"],
    [
      "cavalry",
      "M-5,7 H5 L3,1 L6,-2 L3,-5 L2,-8 L0,-5 L-4,-4 L-6,1 L-2,2 L-3,7 M2,-3 h0.2",
    ],
    [
      "mounted-ranged",
      "M-6,7 H3 L1,1 L4,-2 L1,-5 L0,-8 L-2,-5 L-6,-3 L-7,1 L-3,2 M5,-5 Q10,0 5,5 Z",
    ],
    [
      "artillery",
      "M-7,1 L6,-5 L7,-2 L-4,3 Z M-5,4 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0 M1,4 L6,7",
    ],
    [
      "armor",
      "M-7,2 H7 V6 H-7 Z M-5,2 V-2 H3 V2 M1,-2 V-4 H5 M3,-4 H8 M-4,4 h8",
    ],
    [
      "recon",
      "M-6,-3 H-2 V4 H-7 Z M2,-3 H6 L7,4 H2 Z M-2,0 H2 M-4,-3 V-6 M4,-3 V-6",
    ],
    ["naval-melee", "M-7,2 H7 L4,6 H-4 Z M0,2 V-7 M1,-6 L6,0 H1 Z"],
    ["naval-ranged", "M-7,2 H7 L4,6 H-4 Z M-4,2 V-2 H4 V2 M2,-2 L7,-5"],
    [
      "submarine",
      "M-5,-1 H5 Q9,2 5,5 H-5 Q-9,2 -5,-1 Z M-1,-1 V-6 H3 M-3,2 H3",
    ],
    ["carrier", "M-8,0 H8 L5,6 H-5 Z M-5,-2 H5 M0,-7 V-2 M-3,-4 H3"],
    [
      "fighter",
      "M0,-8 L2,-2 L7,2 V4 L2,2 L1,6 L3,8 H-3 L-1,6 L-2,2 L-7,4 V2 L-2,-2 Z",
    ],
    [
      "bomber",
      "M0,-8 L2,-1 L8,2 V4 L2,3 L1,7 H-1 L-2,3 L-8,4 V2 L-2,-1 Z M-5,3 V6 M5,3 V6",
    ],
    [
      "helicopter",
      "M-7,-6 H7 M0,-6 V-3 M-3,-3 H3 Q7,0 3,3 H-3 Z M-3,0 H-8 V-3 M-4,6 H5 M-2,3 V6 M3,3 V6",
    ],
    ["airship", "M-5,-5 Q-10,0 -5,4 H5 Q10,0 5,-5 Z M-3,4 V7 H3 V4 M0,-5 V4"],
    ["nuclear", "M0,-1 L-4,-7 L4,-7 Z M1,1 L8,1 L4,7 Z M-1,1 L-4,7 L-8,1 Z"],
    ["missile", "M-3,4 L1,-6 L4,-8 L5,-4 L1,6 Z M-3,1 L-7,4 H-3 M2,4 V8 L5,5"],
  ]);
  return compat.truth(compat.has(paths, role))
    ? '<path d="' + compat.format(compat.get(paths, role), "") + '"/>'
    : null;
}
