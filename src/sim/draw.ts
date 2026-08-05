/**
 * Drawing wire onto the board.
 *
 * This is editor policy, not simulation: the simulation reads masks exactly as
 * authored and never infers. Everything here decides what a *stroke* should
 * author, and it is the layer to retune after playing on a real phone.
 *
 * Two rules resolve the cases a plain wire mask cannot represent, since masks
 * are capped at two bits — a stub, a straight, or a bend:
 *
 *   three ways  -> junction   (ending a stroke on a wire reads as intent to join)
 *   four ways   -> crossover  (crossing mid-drag is the common accident, so
 *                              crossing is the forgiving default)
 */

import { Dir, E, Kind, N, S, W, isWireFamily, maskBit, opposite, worldPins } from './kinds';
import { at, cellKind, cellMask, cellRot, idx, inBounds, maskDegree, pack, withMask } from './grid';
import { World } from './world';

export interface Point {
  x: number;
  y: number;
}

/** The direction from a to an orthogonally adjacent b, or null. */
export function dirBetween(a: Point, b: Point): Dir | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return E;
  if (dx === -1 && dy === 0) return W;
  if (dx === 0 && dy === 1) return S;
  if (dx === 0 && dy === -1) return N;
  return null;
}

/**
 * Cells along a line, so a fast drag does not leave gaps.
 *
 * `pointermove` skips cells at speed; an uninterpolated stroke is full of
 * holes. Orthogonal-only, because diagonal wire has no meaning on this board:
 * the walk steps in x and y separately.
 */
export function bresenham(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      pts.push({ x, y });
    }
    if ((x !== x1 || y !== y1) && e2 < dx) {
      err += dx;
      y += sy;
      pts.push({ x, y });
    }
  }
  return pts;
}

function canAuthor(world: World, x: number, y: number): boolean {
  const g = world.grid;
  if (!inBounds(g, x, y)) return false;
  if (g.locked[idx(g, x, y)]) return false;
  return true;
}

/** True when a cell already holds something that is not wire — leave it be. */
function isOccupied(world: World, x: number, y: number): boolean {
  const k = cellKind(at(world.grid, x, y));
  return k !== Kind.Empty && !isWireFamily(k);
}

function addBit(world: World, x: number, y: number, d: Dir): void {
  if (!canAuthor(world, x, y) || isOccupied(world, x, y)) return;
  const g = world.grid;
  const i = idx(g, x, y);
  const cell = g.cells[i];
  const k = cellKind(cell);
  if (k === Kind.Junction || k === Kind.Cross) return; // already faces every way
  const mask = cellMask(cell) | maskBit(d);
  g.cells[i] = k === Kind.Wire ? withMask(cell, mask) : pack(Kind.Wire, E, mask);
  world.dirty = true;
}

/**
 * Promote a wire cell that ended up denser than a mask can express.
 * Three ways becomes a junction; four becomes a crossover.
 */
function promote(world: World, x: number, y: number): void {
  const g = world.grid;
  if (!canAuthor(world, x, y)) return;
  const i = idx(g, x, y);
  const cell = g.cells[i];
  if (cellKind(cell) !== Kind.Wire) return;
  const deg = maskDegree(cellMask(cell));
  if (deg === 3) g.cells[i] = pack(Kind.Junction, E, 0);
  else if (deg === 4) g.cells[i] = pack(Kind.Cross, E, 0);
}

/**
 * Author a stroke through a list of adjacent cells.
 *
 * Cells holding components are stepped over rather than overwritten, but their
 * wire neighbours still get a bit pointing at them — which is how a wire drawn
 * up to a gate actually reaches its pin.
 */
export function drawStroke(world: World, points: Point[]): void {
  const touched: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = dirBetween(a, b);
    if (d === null) continue;
    addBit(world, a.x, a.y, d);
    addBit(world, b.x, b.y, opposite(d));
    touched.push(a, b);
  }
  if (points.length === 1) {
    const p = points[0];
    if (canAuthor(world, p.x, p.y) && !isOccupied(world, p.x, p.y)) {
      const g = world.grid;
      const i = idx(g, p.x, p.y);
      if (cellKind(g.cells[i]) === Kind.Empty) {
        g.cells[i] = pack(Kind.Wire, E, 0);
        world.dirty = true;
      }
    }
  }
  for (const p of touched) promote(world, p.x, p.y);
}

/** Convenience: a straight run between two points on the same row or column. */
export function drawRun(world: World, x0: number, y0: number, x1: number, y1: number): void {
  drawStroke(world, bresenham(x0, y0, x1, y1));
}

/**
 * Point a wire cell at an adjacent component pin.
 *
 * Placing a component next to existing wire should connect it — the player
 * drew the wire there for a reason — so the editor calls this for each pin of
 * a freshly placed component.
 */
export function linkPin(world: World, x: number, y: number, dir: Dir): void {
  const nx = x + (dir === E ? 1 : dir === W ? -1 : 0);
  const ny = y + (dir === S ? 1 : dir === N ? -1 : 0);
  if (!inBounds(world.grid, nx, ny)) return;
  if (!isWireFamily(cellKind(at(world.grid, nx, ny)))) return;
  addBit(world, nx, ny, opposite(dir));
  promote(world, nx, ny);
}

/** Point wire at every pin of the component occupying a cell. */
export function linkComponent(world: World, x: number, y: number): void {
  const kind = cellKind(at(world.grid, x, y));
  if (kind === Kind.Empty || isWireFamily(kind) || kind === Kind.Blueprint) return;
  for (const p of worldPins(kind, x, y, cellRot(at(world.grid, x, y)))) {
    linkPin(world, p.x, p.y, p.dir);
  }
}

/**
 * Link every component on the board to the wire beside it.
 *
 * Order-independent, so a board can be authored components-first or
 * wire-first. Blueprint placements are linked through their own pin list.
 */
export function linkAllPins(world: World): void {
  const g = world.grid;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      linkComponent(world, x, y);
    }
  }
  world.placements.forEach((place) => {
    const bp = world.library.get(place.id);
    if (!bp) return;
    for (const pin of bp.pins) {
      linkPin(world, place.x + pin.dx, place.y + pin.dy, pin.dir);
    }
  });
}

/** Erase along a stroke. */
export function eraseStroke(world: World, points: Point[], remove: (x: number, y: number) => void): void {
  for (const p of points) remove(p.x, p.y);
}
