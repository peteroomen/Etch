/**
 * Wire routing.
 *
 * Freehand drawing is the wrong instrument for this game: circuits are
 * orthogonal, and a wobbly hand-drawn run costs area for nothing. Dragging
 * lays a road — one turn, following whichever axis you set off along — and
 * when a straight elbow is blocked it routes around, preferring long straights
 * over a staircase.
 *
 * This is editor policy like the rest of `draw.ts`: the simulation reads only
 * the cells that come out of it.
 */

import { Kind, isWireFamily } from './kinds';
import { at, cellKind, idx, inBounds } from './grid';
import { Point } from './draw';
import { World } from './world';

export type Axis = 'h' | 'v';

/** Hold a cell inside the board, so dragging past an edge stops at it. */
export function clampToBoard(world: World, p: Point): Point {
  return {
    x: Math.max(0, Math.min(world.grid.w - 1, p.x)),
    y: Math.max(0, Math.min(world.grid.h - 1, p.y)),
  };
}

/** Which way a drag has committed to, from its first real movement. */
export function axisOf(from: Point, to: Point): Axis {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'h' : 'v';
}

/** An L: all the way along one axis, then the other. Inclusive of both ends. */
export function elbowPath(a: Point, b: Point, first: Axis): Point[] {
  const out: Point[] = [];
  const push = (x: number, y: number) => {
    const last = out[out.length - 1];
    if (!last || last.x !== x || last.y !== y) out.push({ x, y });
  };
  if (first === 'h') {
    for (let x = a.x; x !== b.x; x += Math.sign(b.x - a.x)) push(x, a.y);
    push(b.x, a.y);
    for (let y = a.y; y !== b.y; y += Math.sign(b.y - a.y)) push(b.x, y);
    push(b.x, b.y);
  } else {
    for (let y = a.y; y !== b.y; y += Math.sign(b.y - a.y)) push(a.x, y);
    push(a.x, b.y);
    for (let x = a.x; x !== b.x; x += Math.sign(b.x - a.x)) push(x, b.y);
    push(b.x, b.y);
  }
  return out;
}

/**
 * A cell a route may not pass through.
 *
 * Components and blueprints are solid; so are locked cells. Existing wire is
 * fine to route over — that is how you deliberately tap or cross a run.
 */
export function blocked(world: World, x: number, y: number): boolean {
  const g = world.grid;
  if (!inBounds(g, x, y)) return true;
  if (g.locked[idx(g, x, y)]) return true;
  const k = cellKind(at(g, x, y));
  return k !== Kind.Empty && !isWireFamily(k);
}

/** True when every interior cell of a path is free. Endpoints may be terminals. */
export function pathIsClear(world: World, path: Point[]): boolean {
  for (let i = 1; i < path.length - 1; i++) {
    if (blocked(world, path[i].x, path[i].y)) return false;
  }
  return true;
}

const TURN_COST = 4;

/**
 * Route around obstacles, charging for corners.
 *
 * Dijkstra over (cell, heading) rather than plain BFS, because a route with
 * the same length but fewer turns is a better wire — it uses less area and it
 * is far easier to read. The endpoints are allowed to be solid so that a drag
 * can start and finish on a component terminal.
 */
export function routePath(world: World, a: Point, b: Point, prefer: Axis): Point[] | null {
  const g = world.grid;
  if (!inBounds(g, a.x, a.y) || !inBounds(g, b.x, b.y)) return null;
  if (a.x === b.x && a.y === b.y) return [a];

  const W = g.w;
  const H = g.h;
  const HEADINGS = 4; // 0 N, 1 E, 2 S, 3 W
  const size = W * H * HEADINGS;
  const dist = new Int32Array(size).fill(0x7fffffff);
  const prev = new Int32Array(size).fill(-1);
  const step: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const key = (x: number, y: number, h: number) => (y * W + x) * HEADINGS + h;

  // a bucket queue is plenty: every edge costs 1 or 1 + TURN_COST
  const buckets: number[][] = [];
  const push = (node: number, d: number) => {
    if (d >= dist[node]) return;
    dist[node] = d;
    (buckets[d] ??= []).push(node);
  };

  const startPrefer = prefer === 'h' ? (b.x >= a.x ? 1 : 3) : b.y >= a.y ? 2 : 0;
  for (let h = 0; h < HEADINGS; h++) {
    push(key(a.x, a.y, h), h === startPrefer ? 0 : 1);
  }

  let goal = -1;
  for (let d = 0; d < buckets.length && goal < 0; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let qi = 0; qi < bucket.length; qi++) {
      const node = bucket[qi];
      if (dist[node] !== d) continue;
      const h = node % HEADINGS;
      const cell = (node - h) / HEADINGS;
      const x = cell % W;
      const y = (cell - x) / W;
      if (x === b.x && y === b.y) {
        goal = node;
        break;
      }
      for (let nh = 0; nh < HEADINGS; nh++) {
        const nx = x + step[nh][0];
        const ny = y + step[nh][1];
        if (!inBounds(g, nx, ny)) continue;
        // the destination may be solid; nothing else on the way may be
        const isGoal = nx === b.x && ny === b.y;
        if (!isGoal && blocked(world, nx, ny)) continue;
        const cost = d + 1 + (nh === h ? 0 : TURN_COST);
        const next = key(nx, ny, nh);
        if (cost < dist[next]) {
          prev[next] = node;
          push(next, cost);
        }
      }
    }
  }

  if (goal < 0) return null;
  const out: Point[] = [];
  for (let node = goal; node >= 0; node = prev[node]) {
    const h = node % HEADINGS;
    const cell = (node - h) / HEADINGS;
    const x = cell % W;
    const y = (cell - x) / W;
    const last = out[out.length - 1];
    if (!last || last.x !== x || last.y !== y) out.push({ x, y });
  }
  return out.reverse();
}

/**
 * The path a drag should lay: the straight elbow when it fits, a route around
 * when it does not, and nothing at all when there is no way through.
 */
export function planRoute(world: World, a: Point, b: Point, prefer: Axis): Point[] {
  // a wire that leaves the board is not a wire
  if (!inBounds(world.grid, a.x, a.y) || !inBounds(world.grid, b.x, b.y)) return [];
  const elbow = elbowPath(a, b, prefer);
  if (pathIsClear(world, elbow)) return elbow;
  const other = elbowPath(a, b, prefer === 'h' ? 'v' : 'h');
  if (pathIsClear(world, other)) return other;
  return routePath(world, a, b, prefer) ?? [];
}
