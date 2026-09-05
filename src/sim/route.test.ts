import { describe, expect, it } from 'vitest';

import { idx } from './grid';
import { axisOf, blocked, clampToBoard, elbowPath, pathIsClear, planRoute, routePath } from './route';
import { board, inv, run } from './build';
import { Point } from './draw';

const p = (x: number, y: number): Point => ({ x, y });
const shape = (path: Point[]) => path.map((q) => `${q.x},${q.y}`).join(' ');
const corners = (path: Point[]) => {
  let n = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    if ((b.x - a.x) !== (c.x - b.x) || (b.y - a.y) !== (c.y - b.y)) n++;
  }
  return n;
};

describe('a drag lays a road, not a scribble', () => {
  it('commits to the axis it set off along', () => {
    expect(axisOf(p(0, 0), p(5, 1))).toBe('h');
    expect(axisOf(p(0, 0), p(1, 5))).toBe('v');
  });

  it('turns exactly once', () => {
    expect(corners(elbowPath(p(0, 0), p(4, 3), 'h'))).toBe(1);
    expect(corners(elbowPath(p(0, 0), p(4, 3), 'v'))).toBe(1);
  });

  it('puts the corner where the drag direction says it should be', () => {
    expect(shape(elbowPath(p(0, 0), p(2, 2), 'h'))).toBe('0,0 1,0 2,0 2,1 2,2');
    expect(shape(elbowPath(p(0, 0), p(2, 2), 'v'))).toBe('0,0 0,1 0,2 1,2 2,2');
  });

  it('stays straight when it can', () => {
    expect(corners(elbowPath(p(0, 3), p(6, 3), 'h'))).toBe(0);
    expect(shape(elbowPath(p(1, 1), p(1, 1), 'h'))).toBe('1,1');
  });
});

describe('what a route may pass through', () => {
  it('treats wire as passable and components as solid', () => {
    const w = board(10, 6);
    run(w, 1, 2, 5, 2);
    inv(w, 7, 2);
    expect(blocked(w, 3, 2)).toBe(false); // existing wire — crossing it is the point
    expect(blocked(w, 3, 4)).toBe(false); // empty
    expect(blocked(w, 7, 2)).toBe(true); // the inverter
    expect(blocked(w, -1, 2)).toBe(true); // off the board
  });

  it('refuses to route through a locked cell', () => {
    const w = board(10, 6);
    w.grid.locked[idx(w.grid, 4, 2)] = 1;
    expect(blocked(w, 4, 2)).toBe(true);
  });
});

describe('when the straight run is blocked', () => {
  it('takes the other elbow rather than giving up', () => {
    const w = board(12, 8);
    inv(w, 4, 1); // sits on the horizontal-first path from (1,1) to (7,5)
    const path = planRoute(w, p(1, 1), p(7, 5), 'h');
    expect(path.length).toBeGreaterThan(0);
    expect(pathIsClear(w, path)).toBe(true);
    expect(corners(path)).toBe(1); // still just one turn
  });

  it('routes around a wall when no elbow fits', () => {
    const w = board(12, 9);
    // a wall across the middle with one gap at y = 7
    for (let y = 0; y <= 6; y++) inv(w, 5, y);
    const path = planRoute(w, p(1, 2), p(9, 2), 'h');
    expect(path.length).toBeGreaterThan(0);
    expect(pathIsClear(w, path)).toBe(true);
    expect(path[0]).toEqual(p(1, 2));
    expect(path[path.length - 1]).toEqual(p(9, 2));
    // it had to dive below the wall and come back
    expect(path.some((q) => q.y > 6)).toBe(true);
  });

  it('prefers long straights over a staircase', () => {
    const w = board(14, 10);
    const path = routePath(w, p(1, 1), p(10, 6), 'h')!;
    expect(path).toBeTruthy();
    // a diagonal-ish walk would have many corners; charging for turns keeps it low
    expect(corners(path)).toBeLessThanOrEqual(2);
  });

  it('gives back nothing when there is genuinely no way through', () => {
    const w = board(9, 5);
    for (let y = 0; y < 5; y++) inv(w, 4, y); // a full-height wall
    expect(planRoute(w, p(1, 2), p(7, 2), 'h')).toEqual([]);
  });

  it('lets a drag start and end on a component terminal', () => {
    const w = board(12, 6);
    inv(w, 2, 3);
    inv(w, 9, 3);
    const path = planRoute(w, p(2, 3), p(9, 3), 'h');
    expect(path[0]).toEqual(p(2, 3));
    expect(path[path.length - 1]).toEqual(p(9, 3));
    expect(pathIsClear(w, path)).toBe(true);
  });
});

describe('a route stays on the board', () => {
  it('refuses to plan from or to a cell outside it', () => {
    const w = board(10, 6);
    expect(planRoute(w, p(-1, 2), p(5, 2), 'h')).toEqual([]);
    expect(planRoute(w, p(1, 2), p(5, 99), 'v')).toEqual([]);
  });

  it('clamps a drag that wanders past an edge', () => {
    const w = board(10, 6);
    expect(clampToBoard(w, p(-4, 2))).toEqual(p(0, 2));
    expect(clampToBoard(w, p(3, 40))).toEqual(p(3, 5));
    expect(clampToBoard(w, p(4, 4))).toEqual(p(4, 4));
  });
});
