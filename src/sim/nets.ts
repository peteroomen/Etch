/**
 * Net extraction.
 *
 * Runs on edit, never inside the tick loop. Edits happen at human speed; ticks
 * happen twenty times a second.
 */

import { Dir, E, Kind, N, S, W, isHorizontal, isWireFamily, maskBit, opposite } from './kinds';
import { Grid, cellKind, cellMask, effectiveMask, idx } from './grid';
import { LO, V, Z } from './values';

export interface NetTable {
  count: number;
  /** weak resting value per net — LO for every net in tier 1 */
  pull: Uint8Array;
  /** resolved value per net, updated each tick */
  value: Uint8Array;
  /** accumulated strong drivers, cleared and refilled each commit */
  acc: Int32Array;
  /** component indices driving each net, for the inspect tool */
  drivers: number[][];
}

export function createNetTable(count: number, pull: V = LO): NetTable {
  const t: NetTable = {
    count,
    pull: new Uint8Array(count),
    value: new Uint8Array(count),
    acc: new Int32Array(count),
    drivers: [],
  };
  t.pull.fill(pull);
  t.value.fill(pull);
  for (let i = 0; i < count; i++) t.drivers.push([]);
  return t;
}

export function growNets(t: NetTable, extra: number, pull: V = LO): number {
  const first = t.count;
  const next = t.count + extra;
  const pullArr = new Uint8Array(next);
  const valArr = new Uint8Array(next);
  const accArr = new Int32Array(next);
  pullArr.set(t.pull);
  valArr.set(t.value);
  accArr.set(t.acc);
  for (let i = first; i < next; i++) {
    pullArr[i] = pull;
    valArr[i] = pull;
    t.drivers.push([]);
  }
  t.pull = pullArr;
  t.value = valArr;
  t.acc = accArr;
  t.count = next;
  return first;
}

export interface NetMap {
  /** primary net per cell: the net for wire and junction, the E-W net for a crossover */
  netA: Int32Array;
  /** secondary net per cell: the N-S net of a crossover, otherwise -1 */
  netB: Int32Array;
  count: number;
}

const SLOT_H = 0;
const SLOT_V = 1;

/** Which directions a wire-family cell presents on a given slot. */
function portsOf(cell: number, slot: number): Dir[] {
  const k = cellKind(cell);
  if (k === Kind.Cross) return slot === SLOT_H ? [E, W] : [N, S];
  if (k === Kind.Junction) return [N, E, S, W];
  if (k === Kind.Wire) {
    const m = cellMask(cell);
    const out: Dir[] = [];
    for (let d = 0; d < 4; d++) if (m & (1 << d)) out.push(d as Dir);
    return out;
  }
  return [];
}

/** Which slot of a cell a connection arriving along direction `d` lands on. */
function slotFor(cell: number, d: Dir): number {
  return cellKind(cell) === Kind.Cross ? (isHorizontal(d) ? SLOT_H : SLOT_V) : SLOT_H;
}

/**
 * Flood-fill the wire family into nets.
 *
 * Two cells are connected when both face each other. A crossover is walked as
 * two independent nodes so its axes never meet.
 */
export function extractNets(g: Grid): NetMap {
  const n = g.w * g.h;
  const netA = new Int32Array(n).fill(-1);
  const netB = new Int32Array(n).fill(-1);
  const slots = [netA, netB];
  let count = 0;

  const queue: number[] = []; // packed (cellIndex << 1) | slot

  for (let start = 0; start < n; start++) {
    const cell = g.cells[start];
    if (!isWireFamily(cellKind(cell))) continue;
    const maxSlot = cellKind(cell) === Kind.Cross ? 2 : 1;

    for (let s = 0; s < maxSlot; s++) {
      if (slots[s][start] !== -1) continue;
      const net = count++;
      queue.length = 0;
      queue.push((start << 1) | s);
      slots[s][start] = net;

      while (queue.length) {
        const packed = queue.pop()!;
        const ci = packed >> 1;
        const cs = packed & 1;
        const cx = ci % g.w;
        const cy = (ci / g.w) | 0;
        const cc = g.cells[ci];

        for (const d of portsOf(cc, cs)) {
          const nx = cx + (d === E ? 1 : d === W ? -1 : 0);
          const ny = cy + (d === S ? 1 : d === N ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
          const ni = idx(g, nx, ny);
          const nc = g.cells[ni];
          if (!isWireFamily(cellKind(nc))) continue;
          // the neighbour must face back, or there is no connection
          if ((effectiveMask(nc) & maskBit(opposite(d))) === 0) continue;
          const ns = slotFor(nc, opposite(d));
          if (slots[ns][ni] !== -1) continue;
          slots[ns][ni] = net;
          queue.push((ni << 1) | ns);
        }
      }
    }
  }

  return { netA, netB, count };
}

/**
 * The net a component pin binds to.
 *
 * The pin sits on edge `dir` of cell (x, y); the wire it reaches is the
 * neighbour in that direction, entered from the neighbour's opposite edge.
 * Returns -1 when the pin faces nothing, which reads as Z.
 */
export function netAtPin(g: Grid, map: NetMap, x: number, y: number, dir: Dir): number {
  const dx = dir === E ? 1 : dir === W ? -1 : 0;
  const dy = dir === S ? 1 : dir === N ? -1 : 0;
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) return -1;
  const ni = idx(g, nx, ny);
  const nc = g.cells[ni];
  if (!isWireFamily(cellKind(nc))) return -1;
  const back = opposite(dir);
  if ((effectiveMask(nc) & maskBit(back)) === 0) return -1;
  return slotFor(nc, back) === SLOT_V ? map.netB[ni] : map.netA[ni];
}

/** Value of a net, or Z when a pin is bound to nothing. */
export function netValue(t: NetTable, net: number): V {
  return net < 0 ? Z : (t.value[net] as V);
}
