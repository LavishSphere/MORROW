/**
 * Splitting a whole city's trees, cars, and street furniture into square
 * cells, so the renderer can skip the cells off screen or past the fog,
 * and draw far cells with simpler shapes. No three.js, so tests can
 * import it.
 */

/** Cell size in scene units (about 450 m). */
export const CELL = 64;
/** Sets smaller than this stay one mesh: a few extra draw calls cost more than they save. */
export const CHUNK_MIN = 400;
/** Past the far edge of the fog nothing shows, so nothing is drawn. */
export const VIEW_FAR = 340;
/** Trees closer than this get the detailed canopy; farther ones the simple one. */
export const LOD_NEAR = 70;

/** Items grouped by the square cell they stand in, in a stable order. */
export function chunkPlacements<T extends { x: number; z: number }>(items: readonly T[], cell = CELL): T[][] {
  if (items.length < CHUNK_MIN) return items.length > 0 ? [items.slice()] : [];
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.x / cell)}:${Math.floor(item.z / cell)}`;
    let group = cells.get(key);
    if (!group) {
      group = [];
      cells.set(key, group);
    }
    group.push(item);
  }
  return [...cells.keys()].sort().map((key) => cells.get(key)!);
}

export type CellView = "hidden" | "near" | "far";

/**
 * How to draw a cell `gap` scene units from the camera (0 when the camera
 * is inside it): not at all past `far`, the simple shape past `near`.
 */
export function cellView(gap: number, far = VIEW_FAR, near = LOD_NEAR): CellView {
  if (gap > far) return "hidden";
  return gap > near ? "far" : "near";
}
