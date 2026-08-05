/**
 * The authored board.
 *
 * `cells` is the only thing worth saving: net ids are derived data with a
 * different lifetime, so they live in parallel arrays rebuilt on every edit.
 */

import { Dir, Kind, MASK_E, MASK_N, MASK_S, MASK_W, isWireFamily, maskBit } from './kinds';

// kind:6 | rot:2 | mask:4 | flags:4
const KIND_SHIFT = 0;
const KIND_MASK = 0x3f;
const ROT_SHIFT = 6;
const ROT_MASK = 0x3;
const MASK_SHIFT = 8;
const MASK_MASK = 0xf;

export function pack(kind: Kind, rot: Dir = 1, mask = 0): number {
  return (
    ((kind & KIND_MASK) << KIND_SHIFT) |
    ((rot & ROT_MASK) << ROT_SHIFT) |
    ((mask & MASK_MASK) << MASK_SHIFT)
  );
}

export function cellKind(c: number): Kind {
  return ((c >> KIND_SHIFT) & KIND_MASK) as Kind;
}
export function cellRot(c: number): Dir {
  return ((c >> ROT_SHIFT) & ROT_MASK) as Dir;
}
export function cellMask(c: number): number {
  return (c >> MASK_SHIFT) & MASK_MASK;
}
export function withMask(c: number, mask: number): number {
  return (c & ~(MASK_MASK << MASK_SHIFT)) | ((mask & MASK_MASK) << MASK_SHIFT);
}

export interface Grid {
  w: number;
  h: number;
  cells: Uint16Array;
  /** component index owning each cell, or -1 — covers whole multi-cell footprints */
  owner: Int32Array;
  /** cells the player may not edit (level prefab) */
  locked: Uint8Array;
}

export function createGrid(w: number, h: number): Grid {
  const n = w * h;
  const owner = new Int32Array(n);
  owner.fill(-1);
  return { w, h, cells: new Uint16Array(n), owner, locked: new Uint8Array(n) };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

export function idx(g: Grid, x: number, y: number): number {
  return y * g.w + x;
}

export function at(g: Grid, x: number, y: number): number {
  return inBounds(g, x, y) ? g.cells[idx(g, x, y)] : 0;
}

export function kindAt(g: Grid, x: number, y: number): Kind {
  return cellKind(at(g, x, y));
}

export function cloneGrid(g: Grid): Grid {
  return {
    w: g.w,
    h: g.h,
    cells: new Uint16Array(g.cells),
    owner: new Int32Array(g.owner),
    locked: new Uint8Array(g.locked),
  };
}

/**
 * The connection mask a wire-family cell presents to its neighbours.
 *
 * A junction faces all four ways — that is what makes it a junction. A plain
 * wire only faces where it was drawn, which is why two wires crossing without
 * one do not join.
 */
export function effectiveMask(c: number): number {
  const k = cellKind(c);
  if (k === Kind.Junction) return MASK_N | MASK_E | MASK_S | MASK_W;
  if (k === Kind.Cross) return MASK_N | MASK_E | MASK_S | MASK_W;
  if (k === Kind.Wire) return cellMask(c);
  return 0;
}

/** Do two adjacent wire-family cells face each other across direction `d`? */
export function facesAcross(gridCell: number, neighbourCell: number, d: Dir): boolean {
  if (!isWireFamily(cellKind(gridCell)) || !isWireFamily(cellKind(neighbourCell))) return false;
  const a = effectiveMask(gridCell) & maskBit(d);
  const b = effectiveMask(neighbourCell) & maskBit(((d + 2) & 3) as Dir);
  return a !== 0 && b !== 0;
}

/**
 * How many distinct directions a wire cell connects in.
 *
 * Wire masks are capped at two bits — a stub, a straight, or a bend. Anything
 * denser is a junction or a crossover, which is what makes extraction
 * unambiguous. The editor upholds this; the simulation only reads it.
 */
export function maskDegree(mask: number): number {
  let n = 0;
  for (let i = 0; i < 4; i++) if (mask & (1 << i)) n++;
  return n;
}
