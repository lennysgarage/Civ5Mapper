import { ParseError } from "./compat.js";
import type { World } from "./index.js";

export interface CityReligion {
  religionId: number; // -1 = unaffiliated, 0 = pantheon
  followers: number;
  pressure: number;
  holyCity: boolean;
  tradeRoutesApplyingPressure?: number;
}
export interface Religion {
  id: number;
  key?: string;
  nameKey?: string;
  name?: string;
  customName?: string | null;
  customNameKnown?: boolean;
  nameSource?: string;
  metadataIdentity?: string;
  evidence?: Record<string, any>;
  founder?: number | null;
  holyCity?: { x: number; y: number } | null;
}
const integer = (n: any) => Number.isSafeInteger(n);
const fail = (message: string): never => {
  throw new ParseError(message);
};

/** Matches SDK/Lekmod: half of all followers, pressure tie-break, original order
 * on exact ties. Unaffiliated citizens participate; -1 also means no majority. */
export function religiousMajority(records: CityReligion[]): number {
  let total = 0,
    most = -1,
    pressure = 0,
    id = -1;
  for (const r of records) {
    total += r.followers;
    if (r.followers > most || (r.followers === most && r.pressure > pressure)) {
      most = r.followers;
      pressure = r.pressure;
      id = r.religionId;
    }
  }
  return most * 2 >= total ? id : -1;
}
export function validateReligion(world: World) {
  if (world.religions !== undefined) {
    if (!Array.isArray(world.religions)) fail("religions must be an array");
    const ids = new Set<number>();
    for (const r of world.religions) {
      if (!integer(r.id) || r.id < 0 || ids.has(r.id))
        fail("invalid or duplicate religion ID");
      ids.add(r.id);
      for (const k of ["name", "nameKey", "key", "customName"])
        if (r[k] !== undefined && r[k] !== null && typeof r[k] !== "string")
          fail(`invalid religion ${k}`);
      if (
        r.customNameKnown !== undefined &&
        typeof r.customNameKnown !== "boolean"
      )
        fail("invalid customNameKnown");
    }
  }
  for (const city of world.cities) {
    if (
      city.religionKnown !== undefined &&
      typeof city.religionKnown !== "boolean"
    )
      fail("invalid city religionKnown");
    if (city.religionKnown !== true) {
      if (city.religions != null || city.majorityReligionId != null)
        fail("unknown city religion cannot supply records or majority");
      continue;
    }
    if (!Array.isArray(city.religions))
      fail("known city religion requires ordered records");
    const ids = new Set<number>();
    let total = 0;
    for (const r of city.religions) {
      if (!integer(r.religionId) || r.religionId < -1 || ids.has(r.religionId))
        fail("invalid or duplicate city religion ID");
      ids.add(r.religionId);
      if (
        !integer(r.followers) ||
        r.followers < 0 ||
        !integer(r.pressure) ||
        r.pressure < 0 ||
        typeof r.holyCity !== "boolean"
      )
        fail("invalid city religion record");
      if (
        r.tradeRoutesApplyingPressure !== undefined &&
        (!integer(r.tradeRoutesApplyingPressure) ||
          r.tradeRoutesApplyingPressure < 0)
      )
        fail("invalid religion trade route count");
      total += r.followers;
    }
    if (integer(city.population) && total > city.population)
      fail("religion followers exceed city population");
    if (
      city.majorityReligionId !== undefined &&
      city.majorityReligionId !== religiousMajority(city.religions)
    )
      fail("city majority does not match religion records");
  }
  for (const tile of world.tiles) {
    if (
      tile.territoryCityKnown !== undefined &&
      typeof tile.territoryCityKnown !== "boolean"
    )
      fail("invalid territoryCityKnown");
    const ref = tile.territoryCityReference;
    if (
      ref != null &&
      (tile.territoryCityKnown !== true ||
        !integer(ref.owner) ||
        ref.owner < 0 ||
        !integer(ref.localId) ||
        ref.localId < 0)
    )
      fail("invalid territory city reference");
  }
}
export function religionName(world: World, id: number) {
  if (id === -1) return "No religious majority";
  if (id === 0) return "Pantheon";
  const r = world.religions?.find((r) => r.id === id);
  return (
    (r?.customNameKnown === true && r.customName?.trim()) ||
    r?.name ||
    r?.nameKey ||
    r?.key ||
    `Religion ${id}`
  );
}
export function cityReligionName(world: World, city: any) {
  return city.religionKnown === true
    ? religionName(world, religiousMajority(city.religions))
    : "Religion unknown";
}
export function religionAvailability(world: World): string | null {
  if (!world.cities.some((c) => c.religionKnown === true))
    return "Religion view requires validated city religion records. Save city religion serialization has not been validated for this layout; normalized JSON can supply known records.";
  return null;
}
// Fixed ID hashing makes colors stable when another religion disappears.
export function religionColor(id: number | null) {
  if (id === null) return "#c7c3b9";
  if (id === -1) return "#eee7d5";
  if (id === 0) return "#b7aa78";
  const palette = [
    "#cf7358",
    "#688fbc",
    "#819c66",
    "#b481b4",
    "#d3a34e",
    "#56a69e",
    "#b8886a",
    "#8991c3",
    "#c27994",
    "#8ba353",
  ];
  return palette[(Math.imul(id, 7) >>> 0) % palette.length];
}
export function territoryReligion(world: World, tile: any): number | null {
  if (
    tile.landWater !== "land" ||
    tile.owner === null ||
    tile.territoryCityKnown !== true ||
    !tile.territoryCityReference
  )
    return null;
  const ref = tile.territoryCityReference;
  if (ref.owner !== tile.owner) return null;
  const city = world.cities.find(
    (c) => c.owner === ref.owner && c.localId === ref.localId,
  );
  return city?.religionKnown === true
    ? religiousMajority(city.religions)
    : null;
}
const escape = (s: any) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function religionTerritories(
  world: World,
  polygon: (tiles: any[]) => number[][][],
  coords: (p: number[]) => string,
) {
  const groups = new Map<
    string,
    { owner: any; religion: number | null; tiles: any[] }
  >();
  for (const tile of world.tiles) {
    if (tile.landWater !== "land") continue;
    const religion = territoryReligion(world, tile),
      key = `${tile.owner}:${religion}`;
    if (!groups.has(key))
      groups.set(key, { owner: tile.owner, religion, tiles: [] });
    groups.get(key)!.tiles.push(tile);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const path = polygon(g.tiles)
        .map((ring) => `M ${ring.map(coords).join(" L ")} Z`)
        .join(" ");
      const empire = world.civilizations.find((c) => c.id === g.owner);
      const ownerName =
        empire?.playerName ||
        empire?.name ||
        empire?.key ||
        (g.owner === null ? "Unowned land" : `Empire ${g.owner}`);
      const religionCaption =
        g.religion === null
          ? "Assigned-city religion unknown"
          : `Assigned-city religion: ${religionName(world, g.religion)}`;
      return `<path class="religion-territory" data-owner="${g.owner ?? "unowned"}" data-surface="land" data-religion-id="${g.religion ?? "unknown"}" d="${path}" fill="${religionColor(g.religion)}" fill-rule="evenodd"><title>${escape(`${ownerName} — ${religionCaption}`)}</title></path>`;
    })
    .join("");
}
export function religionMarker(
  world: World,
  city: any,
  x: number,
  y: number,
  attributes: string,
) {
  const id =
    city.religionKnown === true ? religiousMajority(city.religions) : null;
  const holy =
    city.religionKnown === true
      ? city.religions.filter((r: CityReligion) => r.holyCity)
      : [];
  const title = `${city.name} — ${cityReligionName(world, city)}${holy.length ? `; holy city: ${holy.map((r: CityReligion) => religionName(world, r.religionId)).join(", ")}` : ""}`;
  return `<g class="city-marker religion-marker"${attributes} data-religion-id="${id ?? "unknown"}"><title>${escape(title)}</title><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" fill="${religionColor(id)}" stroke="#292a28" stroke-width="1.5"/>${holy.length ? `<path class="holy-city-marker" d="M ${x - 4} ${y} L ${x} ${y - 4} L ${x + 4} ${y} L ${x} ${y + 4} Z" fill="#fff8e8" stroke="#292a28"/>` : ""}</g>`;
}

export function religionLegend(world: World) {
  const ids = [
    ...new Set(
      world.cities
        .filter((c) => c.religionKnown === true)
        .flatMap((c) => [
          religiousMajority(c.religions!),
          ...c
            .religions!.filter((r) => r.followers > 0 || r.holyCity)
            .map((r) => r.religionId),
        ]),
    ),
  ].sort((a, b) => a - b);
  return [
    { id: null, name: "Unknown", color: religionColor(null) },
    ...ids.map((id) => ({
      id,
      name: religionName(world, id),
      color: religionColor(id),
    })),
  ];
}

export function layoutReligionLegend(world: World, available: number) {
  let x = 0,
    row = 0;
  const items = religionLegend(world).map((entry) => {
    const name =
      entry.name.length > 22 ? entry.name.slice(0, 21) + "…" : entry.name;
    const width = Math.min(available, 23 + name.length * 5);
    if (x && x + width > available) {
      row++;
      x = 0;
    }
    const item = { ...entry, text: name, x, y: row * 14 };
    x += width;
    return item;
  });
  return { items, height: (row + 1) * 14 };
}
