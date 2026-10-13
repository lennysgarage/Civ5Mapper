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
  if (!sources.length)
    throw new ParseError(
      "culture view requires verified accumulated tourism influence and target lifetime culture from a current snapshot",
    );
  if (perspective === undefined) return sources[0];
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
export function cultureTerritory(
  world: World,
  source: number,
  owner: number | null,
) {
  const civ = world.civilizations.find((c) => c.id === owner);
  const name = civ
    ? civ.playerName || civ.name || civ.key || `Player ${owner}`
    : "Unowned land";
  if (
    owner === source ||
    civ?.kind !== "major" ||
    world.culture?.players.some((p) => p.playerId === owner && !p.alive)
  )
    return {
      fill: CULTURE_NEUTRAL,
      description: `${name} — ${owner === source ? "Source empire" : "Not a tourism target"}`,
    };
  const pair = culturePair(world, source, owner);
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
export function cultureLegend(world: World, source: number) {
  const civ = world.civilizations.find((c) => c.id === source)!;
  return `Tourism influence from ${civ.playerName || civ.name || civ.key || `Player ${source}`} · 0–200% of target lifetime culture · darker = stronger · colors capped at 200% · hatched = unknown · gray = not a target`;
}
export const CULTURE_PATTERN =
  '<pattern id="culture-unknown" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#dadada"/><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="#858585" stroke-width="1.5"/></pattern>';
export function cultureSvg(svg: string, world: World, source: number) {
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
      return path
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
      newH = h + 54;
    svg = svg.replace(match[0], `viewBox="${x} ${y} ${w} ${newH}"`);
    const pieces = [
      `Tourism influence from ${world.civilizations.find((c) => c.id === source)?.playerName || world.civilizations.find((c) => c.id === source)?.name || `Player ${source}`}`,
      "0–200% · darker = stronger · colors capped",
      "Hatched = unavailable · gray = not a target",
    ];
    svg = svg.replace(
      "</svg>",
      `<g class="culture-legend"><rect x="${x}" y="${y + h}" width="${w}" height="54" fill="#faf7f0"/>${pieces.map((s, i) => `<text x="${x + 12}" y="${y + h + 15 + i * 15}" font-family="sans-serif" font-size="11">${escape(s)}</text>`).join("")}</g></svg>`,
    );
  }
  return svg;
}
