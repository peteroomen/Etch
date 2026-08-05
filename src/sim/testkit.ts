/**
 * Helpers for building boards in tests and in level reference solutions.
 *
 * Deliberately terse: a circuit written with these should read like a wiring
 * list, so a wrong test is visible as a wrong circuit.
 */

import { Dir, E, Kind, W } from './kinds';
import { drawRun, drawStroke, linkAllPins, linkPin, Point } from './draw';
import { BlueprintLibrary } from './blueprint';
import {
  World,
  createWorld,
  placeBlueprint,
  placeComponent,
  rebuild,
  reset,
  setInputVector,
  settle,
  readOutputVector,
  componentCount,
} from './world';
import { at, cellKind, idx } from './grid';

export function board(w: number, h: number, library?: BlueprintLibrary): World {
  return createWorld(w, h, library);
}

export function src(world: World, name: string, x: number, y: number, rot: Dir = E): void {
  placeComponent(world, Kind.Source, x, y, rot, name);
}

export function sink(world: World, name: string, x: number, y: number, rot: Dir = E): void {
  placeComponent(world, Kind.Sink, x, y, rot, name);
}

export function inv(world: World, x: number, y: number, rot: Dir = E): void {
  placeComponent(world, Kind.Inverter, x, y, rot);
}

export function led(world: World, x: number, y: number, rot: Dir = E): void {
  placeComponent(world, Kind.Led, x, y, rot);
}

export function junction(world: World, x: number, y: number): void {
  placeJunction(world, x, y);
}

function placeJunction(world: World, x: number, y: number): void {
  world.grid.cells[idx(world.grid, x, y)] = (Kind.Junction & 0x3f) | (E << 6);
  world.dirty = true;
}

export function cross(world: World, x: number, y: number): void {
  world.grid.cells[idx(world.grid, x, y)] = (Kind.Cross & 0x3f) | (E << 6);
  world.dirty = true;
}

/** A straight wire run, inclusive of both ends. */
export function run(world: World, x0: number, y0: number, x1: number, y1: number): void {
  drawRun(world, x0, y0, x1, y1);
}

/** A wire path through a list of corner points. */
export function path(world: World, ...pts: [number, number][]): void {
  const cells: Point[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    cells.push({ x, y });
    while (x !== x1 || y !== y1) {
      x += dx;
      y += dy;
      cells.push({ x, y });
    }
  }
  drawStroke(world, cells);
}

export function bp(world: World, id: string, x: number, y: number, rot: Dir = E): boolean {
  return placeBlueprint(world, id, x, y, rot);
}

/** Connect a freshly placed component's pins to any wire already beside them. */
export function link(world: World, x: number, y: number, ...dirs: Dir[]): void {
  for (const d of dirs) linkPin(world, x, y, d);
}

export interface VectorResult {
  out: boolean[];
  ticks: number;
  settled: boolean;
}

/**
 * Run a sequence of input vectors from a single power-on, the way a player
 * flipping switches would.
 *
 * Depth is therefore measured from the previous stable state, which is what
 * propagation delay actually means. Resetting between vectors would measure
 * the power-on transient instead.
 */
export function runVectors(
  world: World,
  inNames: string[],
  outNames: string[],
  vectors: boolean[][],
): VectorResult[] {
  linkAllPins(world);
  rebuild(world);
  reset(world);
  settle(world);
  return vectors.map((bits) => {
    setInputVector(world, inNames, bits);
    const s = settle(world);
    return { out: readOutputVector(world, outNames), ticks: s.ticks, settled: s.settled };
  });
}

/** Every input combination, in counting order, MSB first. */
export function allVectors(n: number): boolean[][] {
  const out: boolean[][] = [];
  for (let i = 0; i < 1 << n; i++) {
    const row: boolean[] = [];
    for (let b = n - 1; b >= 0; b--) row.push((i & (1 << b)) !== 0);
    out.push(row);
  }
  return out;
}

/** The full truth table of a board, as rows of output bits. */
export function truthTable(world: World, inNames: string[], outNames: string[]): boolean[][] {
  return runVectors(world, inNames, outNames, allVectors(inNames.length)).map((r) => r.out);
}

/** Worst-case propagation depth across a vector sweep. */
export function worstTicks(results: VectorResult[]): number {
  return results.reduce((m, r) => Math.max(m, r.ticks), 0);
}

/** Cells the player authored — the third scoring metric. */
export function areaUsed(world: World): number {
  const g = world.grid;
  let n = 0;
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] !== 0 && !g.locked[i]) n++;
  }
  return n;
}

export function score(world: World, results: VectorResult[]): {
  components: number;
  ticks: number;
  area: number;
} {
  return {
    components: componentCount(world),
    ticks: worstTicks(results),
    area: areaUsed(world),
  };
}

/** Readable dump of a board, for debugging a failing test. */
export function render(world: World): string {
  const g = world.grid;
  const glyph = (k: Kind): string =>
    ({
      [Kind.Empty]: '.',
      [Kind.Wire]: '+',
      [Kind.Junction]: 'o',
      [Kind.Cross]: 'x',
      [Kind.Inverter]: '>',
      [Kind.Delay]: 'd',
      [Kind.Source]: 'I',
      [Kind.Sink]: 'O',
      [Kind.Switch]: 'S',
      [Kind.Clock]: 'C',
      [Kind.Led]: '*',
      [Kind.Seg7]: '7',
      [Kind.Nixie]: 'N',
      [Kind.Blueprint]: '#',
    })[k] ?? '?';
  const lines: string[] = [];
  for (let y = 0; y < g.h; y++) {
    let s = '';
    for (let x = 0; x < g.w; x++) s += glyph(cellKind(at(g, x, y)));
    lines.push(s);
  }
  return lines.join('\n');
}

export { W, E };
