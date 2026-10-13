import type { World } from "./index.js";
import {
  CULTURE_LEVELS,
  validateCulture,
  type CultureLevel,
} from "./culture.js";
import { ParseError } from "./compat.js";

export const CULTURE_NEUTRAL = "#c9c5bb";
export const CULTURE_UNKNOWN = "url(#culture-unknown)";
export function cultureSources(world: World) {
  if (!world.culture || world.culture.turn !== world.game.turn) return [];
  return world.culture.players
    .filter(
      (p) =>
        p.alive &&
        world.civilizations.some(
          (c) => c.id === p.playerId && c.kind === "major",
        ) &&
        Object.entries(p.accumulatedInfluence).some(
          ([id, n]) =>
            Number(id) !== p.playerId &&
            n !== null &&
            world.culture!.players.some(
              (t) =>
                t.playerId === Number(id) &&
                t.alive &&
                t.lifetimeCulture !== null,
            ),
        ),
    )
    .map((p) => p.playerId)
    .sort((a, b) => a - b);
}
export function culturePerspective(world: World, perspective?: number) {
  validateCulture(world);
  const sources = cultureSources(world);
  if (perspective === undefined && cultureOverviewAvailable(world)) return null;
  if (!sources.length)
    throw new ParseError(
      "culture view requires verified accumulated tourism from a current snapshot",
    );
  if (perspective === undefined) return null;
  if (!Number.isInteger(perspective) || !sources.includes(perspective))
    throw new ParseError(
      "culture perspective must identify a living major empire with verified influence data",
    );
  return perspective;
}
export function culturePair(world: World, source: number, target: number) {
  const s = world.culture?.players.find((p) => p.playerId === source),
    t = world.culture?.players.find((p) => p.playerId === target);
  const influence = s?.accumulatedInfluence[target] ?? null,
    lifetime = t?.lifetimeCulture ?? null;
  const percent =
    influence !== null && lifetime !== null
      ? lifetime > 0
        ? Number((BigInt(influence) * 100n) / BigInt(lifetime))
        : 0
      : null;
  const contact = s?.contact?.[target] ?? null;
  let level: CultureLevel | null = null;
  if (contact === true && percent !== null && world.culture?.thresholds) {
    level = "unknown";
    world.culture.thresholds.values.forEach((n, i) => {
      if (percent >= n) level = CULTURE_LEVELS[i];
    });
  }
  return { source, target, influence, lifetime, percent, contact, level };
}
export function cultureColor(percent: number) {
  const t = Math.max(0, Math.min(200, percent)) / 200;
  const start = [248, 237, 210],
    end = [118, 42, 130];
  return (
    "#" +
    start
      .map((n, i) =>
        Math.round(n + (end[i] - n) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
/** Sum saved directed totals, excluding self and city-states. Never treat missing pairs as zero. */
export function cultureExports(world: World, source: number) {
  const player = world.culture?.players.find((p) => p.playerId === source);
  const targets = world.civilizations.filter(
    (c) => c.kind === "major" && c.id !== source,
  );
  const values = targets.map((c) => player?.accumulatedInfluence[c.id] ?? null);
  const knownTargets = values.filter((n) => n !== null).length;
  return {
    total:
      player && knownTargets === targets.length
        ? values.reduce<number>((sum, n) => sum + n!, 0)
        : null,
    targets: targets.length,
    knownTargets,
  };
}
export function cultureExportMaximum(world: World) {
  return Math.max(
    0,
    ...world.civilizations
      .filter(
        (c) =>
          c.kind === "major" &&
          c.eliminated !== true &&
          world.culture?.players.some((p) => p.playerId === c.id && p.alive),
      )
      .map((c) => cultureExports(world, c.id).total ?? 0),
  );
}
export function cultureOverviewAvailable(world: World) {
  return (
    world.culture?.turn === world.game.turn &&
    (cultureSources(world).length > 0 ||
      world.civilizations.some(
        (c) =>
          c.kind === "major" &&
          world.culture?.players.some((p) => p.playerId === c.id && p.alive) &&
          cultureExports(world, c.id).total !== null,
      ))
  );
}
export function cultureExportColor(world: World, total: number) {
  const maximum = cultureExportMaximum(world);
  return cultureColor(maximum > 0 ? (total / maximum) * 200 : 0);
}
export function cultureEmpireColor(world: World, id: number) {
  const colors = [
    "#d99572",
    "#9ab77a",
    "#8991c3",
    "#56a69e",
    "#c27994",
    "#d3a34e",
  ];
  return (
    world.civilizations.find((c) => c.id === id)?.color ||
    colors[id % colors.length]
  );
}
export function cultureTerritory(
  world: World,
  source: number | null,
  owner: number | null,
) {
  const civ = world.civilizations.find((c) => c.id === owner);
  const name = civ
    ? civ.playerName || civ.name || civ.key || `Player ${owner}`
    : "Unowned land";
  if (source !== null && owner === source)
    return {
      fill: cultureEmpireColor(world, source),
      description: `${name} — Tourism source: sends accumulated tourism to other empires; its own color does not indicate incoming influence`,
    };
  if (
    civ?.kind !== "major" ||
    world.culture?.players.some((p) => p.playerId === owner && !p.alive)
  )
    return {
      fill: CULTURE_NEUTRAL,
      description: `${name} — Not a tourism target`,
    };
  if (source === null) {
    const exports = cultureExports(world, owner!);
    return {
      fill:
        exports.total === null
          ? CULTURE_UNKNOWN
          : cultureExportColor(world, exports.total),
      description: `${name} — Total accumulated tourism exported: ${exports.total === null ? `Unknown (${exports.knownTargets}/${exports.targets} target totals known)` : exports.total}; summed across other major empires, including eliminated targets`,
    };
  }
  const pair = culturePair(world, source, owner!);
  return {
    fill: pair.percent === null ? CULTURE_UNKNOWN : cultureColor(pair.percent),
    description:
      pair.percent === null
        ? `${name} — Recorded tourism influence unavailable`
        : `${name} — Recorded tourism influence: ${pair.influence}; target lifetime culture: ${pair.lifetime}; ${pair.percent}%${pair.level ? `; ${pair.level}` : ""}; contact ${pair.contact === null ? "unknown" : pair.contact ? "met" : "unmet"}`,
  };
}
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function cultureLegend(world: World, source: number | null) {
  if (source === null)
    return "Accumulated tourism overview · each empire’s own territory shows its total accumulated tourism exported · click an empire to see its outgoing influence · darker purple = more exported · gray = not a major empire · hatched = incomplete totals";
  const civ = world.civilizations.find((c) => c.id === source)!;
  return `Tourism influence from ${civ.playerName || civ.name || civ.key || `Player ${source}`} · 0–200% of target lifetime culture · darker purple = stronger · colors capped at 200% · hatched = unknown · source = own empire color with dashed outline · gray = not a target`;
}
export const CULTURE_PATTERN =
  '<pattern id="culture-unknown" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#dadada"/><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#858585" stroke-width="1.5"/></pattern>';
export function cultureSvg(svg: string, world: World, source: number | null) {
  svg = svg.replace(
    /(<title>)Political map([^<]*<\/title>)/,
    "$1Tourism influence$2",
  );
  svg = svg.replace(
    /(<text\b[^>]*>)Political map([^<]*<\/text>)/,
    "$1Tourism influence$2",
  );
  svg = svg.replace(
    /<svg\b/,
    `<svg aria-label="${escape(cultureLegend(world, source))}"`,
  );
  svg = svg.replace(/(<svg[^>]*>)/, `$1<defs>${CULTURE_PATTERN}</defs>`);
  svg = svg.replace(
    /<path data-owner="([^"]+)" data-surface="(land)"([\s\S]*?)<\/path>/g,
    (path, owner) => {
      const territory = cultureTerritory(
        world,
        source,
        owner === "unowned" ? null : Number(owner),
      );
      const isSource =
        source !== null && Number(owner) === source && owner !== "unowned";
      return path
        .replace(
          "<path ",
          `<path data-tourism-role="${isSource ? "source" : "target"}"${isSource ? ' stroke="#252525" stroke-width="2.5" stroke-dasharray="6 3"' : ""} `,
        )
        .replace(/fill="[^"]+"/, `fill="${territory.fill}"`)
        .replace(
          /<title>[\s\S]*?<\/title>/,
          `<title>${escape(territory.description)}</title>`,
        );
    },
  );
  // Reserve a separate footer band, preserving the map geometry and labels.
  const match = svg.match(/viewBox="([\d.\-]+) ([\d.\-]+) ([\d.]+) ([\d.]+)"/);
  if (match) {
    const [x, y, w, h] = match.slice(1).map(Number),
      newH = h + cultureLegendHeight(world, w);
    svg = svg.replace(match[0], `viewBox="${x} ${y} ${w} ${newH}"`);
    svg = svg.replace(
      "</svg>",
      `<g class="culture-legend" data-x="${x}" data-y="${y + h}" data-width="${w}">${cultureLegendSvg(world, source, x, y + h, w)}</g></svg>`,
    );
  }
  return svg;
}

export function cultureLegendHeight(world: World, width: number) {
  return (
    72 +
    Math.ceil(
      cultureSources(world).length / Math.max(1, Math.floor(width / 170)),
    ) *
      18
  );
}
export function cultureLegendSvg(
  world: World,
  source: number | null,
  x: number,
  y: number,
  width: number,
) {
  const civ = world.civilizations.find((c) => c.id === source);
  const name = civ?.playerName || civ?.name || `Player ${source}`;
  const lines =
    source === null
      ? [
          "Accumulated tourism overview",
          `Each empire’s own territory shows total tourism exported · scale: 0–${cultureExportMaximum(world)}`,
          "Darker purple = more exported · click for target influence · hatched = incomplete totals",
        ]
      : [
          `Tourism influence from ${name}`,
          "Recorded tourism ÷ target lifetime culture · 0–200% · darker purple = stronger · colors capped",
          "Source = empire color + dashed outline · targets = cream-to-purple scale · gray = not a target",
        ];
  const cols = Math.max(1, Math.floor(width / 170));
  const keys =
    source === null
      ? [0, 0.25, 0.5, 1]
          .map((fraction, i) => {
            const total = Math.round(cultureExportMaximum(world) * fraction);
            return `<rect x="${x + 12 + i * 110}" y="${y + 51}" width="12" height="10" fill="${cultureExportColor(world, total)}"/><text x="${x + 29 + i * 110}" y="${y + 60}" font-family="sans-serif" font-size="11">${total}</text>`;
          })
          .join("")
      : `<rect x="${x + 12}" y="${y + 51}" width="12" height="12" fill="${cultureEmpireColor(world, source)}" stroke="#252525" stroke-dasharray="3 2"/><text x="${x + 30}" y="${y + 61}" font-family="sans-serif" font-size="11">Tourism source: ${escape(name)} · clear selection for overview</text>` +
        [0, 50, 100, 200]
          .map(
            (percent, i) =>
              `<rect x="${x + 12 + i * 82}" y="${y + 71}" width="12" height="10" fill="${cultureColor(percent)}"/><text x="${x + 29 + i * 82}" y="${y + 80}" font-family="sans-serif" font-size="11">${percent}%</text>`,
          )
          .join("");
  return `<rect x="${x}" y="${y}" width="${width}" height="${cultureLegendHeight(world, width)}" fill="#faf7f0"/>${lines.map((line, i) => `<text x="${x + 12}" y="${y + 15 + i * 15}" font-family="sans-serif" font-size="11">${escape(line)}</text>`).join("")}${keys}`;
}
