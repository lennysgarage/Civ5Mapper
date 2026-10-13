import { validateWorld, type World, ParseError } from "./index.js";
import { sha256 } from "./compat.js";
export function addTurnOnePlayers(input: World, reference: World): World {
  validateWorld(input);
  validateWorld(reference);
  if (reference.game.turn !== 1)
    throw new ParseError(
      "historical player evidence requires a turn-1 save; lobby/turn-0 snapshots are insufficient",
    );
  if (input.source.kind !== "save" || reference.source.kind !== "save")
    throw new ParseError("turn-1 player evidence requires save-derived worlds");
  if (
    ["width", "height", "wrapX", "wrapY", "coordinates"].some(
      (k) => input.game[k] !== reference.game[k],
    )
  )
    throw new ParseError("turn-1 save grid mismatch");
  const geography = (w: World) =>
    w.tiles
      .map((t) => [
        t.x,
        t.y,
        t.landWater,
        t.elevation ?? null,
        t.terrainId ?? null,
      ])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const physical = geography(input);
  if (JSON.stringify(physical) !== JSON.stringify(geography(reference)))
    throw new ParseError("turn-1 save geography mismatch");
  const roster = (w: World) =>
    w.civilizations
      .filter((c) => c.kind === "major")
      .map((c) => [c.id, c.key, c.leaderKey ?? null])
      .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (JSON.stringify(roster(input)) !== JSON.stringify(roster(reference)))
    throw new ParseError("turn-1 save civilization slot mismatch");
  const a = input.inspection?.header?.mapScript,
    b = reference.inspection?.header?.mapScript;
  if (a && b && a !== b)
    throw new ParseError("turn-1 save map script mismatch");
  const statuses = new Map(
    reference.civilizations.map((c) => [c.id, c.setupSlotStatus ?? null]),
  );
  for (const c of input.civilizations)
    if (c.kind === "major") {
      const s = statuses.get(c.id);
      if (
        s !== null &&
        (!Number.isInteger(s) || typeof s !== "number" || s < 0 || s > 4)
      )
        throw new ParseError("invalid turn-1 slot status");
    }
  const world = structuredClone(input);
  for (const c of world.civilizations)
    if (c.kind === "major") c.turnOneSlotStatus = statuses.get(c.id);
  world.game.turnOnePlayerEvidence = {
    turn: 1,
    sourceSha256: reference.source.sha256 ?? null,
    geographySha256: sha256(
      new TextEncoder().encode(JSON.stringify(physical)),
    ).hexdigest(),
    validation: "exact-grid-geography-major-roster",
  };
  world.extraction.fields.turnOnePlayerGroups = world.civilizations
    .filter((c) => c.kind === "major")
    .every((c) => [1, 3].includes(c.turnOneSlotStatus))
    ? "extracted"
    : "partial";
  return world;
}
