import type { Tile } from "./index.js";

/** One label per connected wonder, retaining a marker on every recorded tile. */
export function naturalWonderLabelTiles(
  tiles: Tile[],
  width: number,
  wrapX: boolean,
) {
  const remaining = new Map(
    tiles
      .filter((tile) => tile.naturalWonder)
      .map((tile) => [`${tile.x},${tile.y}`, tile]),
  );
  const labels = new Set<string>();
  while (remaining.size) {
    const first = remaining.values().next().value!;
    const queue = [first],
      group = [first];
    remaining.delete(`${first.x},${first.y}`);
    while (queue.length) {
      const tile = queue.pop()!;
      const diagonal = tile.y & 1 ? 1 : -1;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [diagonal, -1],
        [0, 1],
        [diagonal, 1],
      ]) {
        const x = wrapX ? (tile.x + dx + width) % width : tile.x + dx;
        const key = `${x},${tile.y + dy}`,
          neighbor = remaining.get(key);
        if (
          !neighbor ||
          neighbor.naturalWonder?.type !== first.naturalWonder.type
        )
          continue;
        remaining.delete(key);
        group.push(neighbor);
        queue.push(neighbor);
      }
    }
    group.sort((a, b) => a.y - b.y || a.x - b.x);
    labels.add(`${group[0].x},${group[0].y}`);
  }
  return labels;
}
