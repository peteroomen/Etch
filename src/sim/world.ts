/**
 * The world: grid, nets, components, and the tick loop.
 *
 * Evaluation is two-phase — read every component's inputs, then commit every
 * output at once — so evaluation order cannot matter and results are
 * deterministic by construction.
 *
 * The one rule that makes tier 1 work: nothing drives a strong LO. Every
 * driver either pulls the net HIGH or lets go, and each net's weak pull-down
 * supplies all the zeros. Wired-OR falls out of the resolver, and contention
 * is unreachable until transistors introduce a strong low.
 */

import { Dir, E, Kind, isWireFamily, kindDef, worldPins } from './kinds';
import { Grid, at, cellKind, cellRot, cloneGrid, createGrid, idx, inBounds, pack } from './grid';
import { NetMap, NetTable, createNetTable, extractNets, growNets, netAtPin, netValue } from './nets';
import { HI, LO, V, X, Z, driveBit, resolve } from './values';
import { BlueprintLibrary, flattenBlueprint } from './blueprint';

export interface Component {
  idx: number;
  kind: Kind;
  x: number;
  y: number;
  rot: Dir;
  inNets: number[];
  outNet: number;
  /** computed during the read phase, applied during commit */
  next: V;
  /** currently committed output */
  out: V;
  /** switch position, or unused */
  state: number;
  /** blueprint placement index, or -1 for a directly placed primitive */
  instance: number;
  /** level pin name for sources and sinks */
  pin?: string;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  rot: Dir;
}

export interface World {
  grid: Grid;
  placements: Placement[];
  library: BlueprintLibrary;
  map: NetMap;
  nets: NetTable;
  comps: Component[];
  ticks: number;
  clockPeriod: number;
  /** set by every edit; rebuild() clears it */
  dirty: boolean;
  /** source pins currently driven high, by name */
  inputs: Map<string, boolean>;
  /** "x,y" -> level pin name, for sources and sinks */
  pinNames: Map<string, string>;
}

const EMPTY_LIBRARY: BlueprintLibrary = new Map();

/** Largest footprint any component has, used when searching for an origin. */
const MAX_FOOTPRINT_W = 2;
const MAX_FOOTPRINT_H = 5;

export function createWorld(w: number, h: number, library: BlueprintLibrary = EMPTY_LIBRARY): World {
  const world: World = {
    grid: createGrid(w, h),
    placements: [],
    library,
    map: { netA: new Int32Array(0), netB: new Int32Array(0), count: 0 },
    nets: createNetTable(0),
    comps: [],
    ticks: 0,
    clockPeriod: 4,
    dirty: true,
    inputs: new Map(),
    pinNames: new Map(),
  };
  rebuild(world);
  return world;
}

// ---------------------------------------------------------------- footprints

/**
 * The origin cell of a multi-cell primitive covering (x, y), or null.
 *
 * Footprints are small, so a bounded scan back and up is cheaper than keeping
 * another parallel array in sync on every edit.
 */
function originCovering(g: Grid, x: number, y: number): { x: number; y: number } | null {
  for (let dy = 0; dy < MAX_FOOTPRINT_H; dy++) {
    for (let dx = 0; dx < MAX_FOOTPRINT_W; dx++) {
      const ox = x - dx;
      const oy = y - dy;
      if (!inBounds(g, ox, oy)) continue;
      const def = kindDef(cellKind(at(g, ox, oy)));
      if (!def) continue;
      if (dx < def.w && dy < def.h) return { x: ox, y: oy };
    }
  }
  return null;
}

function clearFootprintAt(world: World, ox: number, oy: number): void {
  const g = world.grid;
  const def = kindDef(cellKind(at(g, ox, oy)));
  const w = def?.w ?? 1;
  const h = def?.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!inBounds(g, ox + dx, oy + dy)) continue;
      const i = idx(g, ox + dx, oy + dy);
      g.cells[i] = 0;
      g.owner[i] = -1;
    }
  }
  world.pinNames.delete(`${ox},${oy}`);
}

/** Remove a blueprint instance and reindex the placements above it. */
function clearInstance(world: World, instance: number): void {
  const g = world.grid;
  for (let i = 0; i < g.owner.length; i++) {
    if (g.owner[i] === instance) {
      g.owner[i] = -1;
      g.cells[i] = 0;
    }
  }
  world.placements.splice(instance, 1);
  for (let i = 0; i < g.owner.length; i++) {
    if (g.owner[i] > instance) g.owner[i] -= 1;
  }
}

// ---------------------------------------------------------------- editing

export function setCell(world: World, x: number, y: number, kind: Kind, mask = 0, rot: Dir = E): boolean {
  const g = world.grid;
  if (!inBounds(g, x, y)) return false;
  if (g.locked[idx(g, x, y)]) return false;
  removeAt(world, x, y);
  g.cells[idx(g, x, y)] = pack(kind, rot, mask);
  world.dirty = true;
  return true;
}

/**
 * Empty a cell — including the rest of whatever footprint it belongs to.
 * A locked cell is left alone.
 */
export function removeAt(world: World, x: number, y: number): boolean {
  const g = world.grid;
  if (!inBounds(g, x, y)) return false;
  const i = idx(g, x, y);
  if (g.locked[i]) return false;

  const instance = g.owner[i];
  if (instance >= 0) {
    clearInstance(world, instance);
    world.dirty = true;
    return true;
  }
  const origin = originCovering(g, x, y);
  if (origin) {
    clearFootprintAt(world, origin.x, origin.y);
    world.dirty = true;
    return true;
  }
  if (g.cells[i] !== 0) {
    g.cells[i] = 0;
    world.dirty = true;
    return true;
  }
  return false;
}

export function placeComponent(
  world: World,
  kind: Kind,
  x: number,
  y: number,
  rot: Dir = E,
  pin?: string,
): boolean {
  const g = world.grid;
  const def = kindDef(kind);
  const w = def?.w ?? 1;
  const h = def?.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!inBounds(g, x + dx, y + dy)) return false;
      if (g.locked[idx(g, x + dx, y + dy)]) return false;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) removeAt(world, x + dx, y + dy);
  }
  g.cells[idx(g, x, y)] = pack(kind, rot, 0);
  if (pin) world.pinNames.set(`${x},${y}`, pin);
  world.dirty = true;
  return true;
}

export function placeBlueprint(world: World, id: string, x: number, y: number, rot: Dir = E): boolean {
  const bp = world.library.get(id);
  if (!bp) return false;
  const g = world.grid;
  for (let dy = 0; dy < bp.h; dy++) {
    for (let dx = 0; dx < bp.w; dx++) {
      if (!inBounds(g, x + dx, y + dy)) return false;
      if (g.locked[idx(g, x + dx, y + dy)]) return false;
    }
  }
  for (let dy = 0; dy < bp.h; dy++) {
    for (let dx = 0; dx < bp.w; dx++) removeAt(world, x + dx, y + dy);
  }
  const instance = world.placements.length;
  world.placements.push({ id, x, y, rot });
  for (let dy = 0; dy < bp.h; dy++) {
    for (let dx = 0; dx < bp.w; dx++) {
      const i = idx(g, x + dx, y + dy);
      g.cells[i] = pack(Kind.Blueprint, rot, 0);
      g.owner[i] = instance;
    }
  }
  world.dirty = true;
  return true;
}

// ---------------------------------------------------------------- rebuild

function mkComp(
  idxNo: number,
  kind: Kind,
  x: number,
  y: number,
  rot: Dir,
  inNets: number[],
  outNet: number,
  instance: number,
  pin?: string,
): Component {
  return { idx: idxNo, kind, x, y, rot, inNets, outNet, next: Z, out: Z, state: 0, instance, pin };
}

/**
 * Re-derive nets and components from the board. Call after any edit, before
 * the next tick — it is explicit rather than automatic so the editor can batch
 * a whole drag stroke into one extraction.
 */
/**
 * Union the host nets that a blueprint's pins share internally.
 *
 * A NOR's two inputs are one net inside the gate, so placing one genuinely
 * joins the two wires feeding it — and the player sees them light as one node,
 * which is the honest signal that the gate consumed its inputs.
 */
function aliasPlacementPins(world: World, map: NetMap): void {
  const g = world.grid;
  const parent = new Int32Array(map.count);
  for (let i = 0; i < map.count; i++) parent[i] = i;

  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r];
    while (parent[a] !== r) {
      const nextA = parent[a];
      parent[a] = r;
      a = nextA;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  let anyAlias = false;
  for (const place of world.placements) {
    const bp = world.library.get(place.id);
    if (!bp) continue;
    const byInternal = new Map<number, number[]>();
    bp.pins.forEach((pin) => {
      const host = netAtPin(g, map, place.x + pin.dx, place.y + pin.dy, pin.dir);
      if (host < 0) return;
      const list = byInternal.get(pin.net);
      if (list) list.push(host);
      else byInternal.set(pin.net, [host]);
    });
    for (const hosts of byInternal.values()) {
      for (let i = 1; i < hosts.length; i++) {
        union(hosts[0], hosts[i]);
        anyAlias = true;
      }
    }
  }
  if (!anyAlias) return;

  // renumber so net ids stay dense
  const remap = new Int32Array(map.count).fill(-1);
  let next = 0;
  for (let i = 0; i < map.count; i++) {
    const root = find(i);
    if (remap[root] === -1) remap[root] = next++;
    remap[i] = remap[root];
  }
  for (let i = 0; i < map.netA.length; i++) {
    if (map.netA[i] >= 0) map.netA[i] = remap[map.netA[i]];
    if (map.netB[i] >= 0) map.netB[i] = remap[map.netB[i]];
  }
  map.count = next;
}

export function rebuild(world: World): void {
  const g = world.grid;
  const map = extractNets(g);
  aliasPlacementPins(world, map);
  const nets = createNetTable(map.count, LO);
  const comps: Component[] = [];

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const cell = at(g, x, y);
      const kind = cellKind(cell);
      if (kind === Kind.Empty || isWireFamily(kind) || kind === Kind.Blueprint) continue;
      const rot = cellRot(cell);
      const inNets: number[] = [];
      let outNet = -1;
      for (const p of worldPins(kind, x, y, rot)) {
        const net = netAtPin(g, map, p.x, p.y, p.dir);
        if (p.role === 'in') inNets.push(net);
        else outNet = net;
      }
      comps.push(
        mkComp(comps.length, kind, x, y, rot, inNets, outNet, -1, world.pinNames.get(`${x},${y}`)),
      );
    }
  }

  world.placements.forEach((place, instance) => {
    const bp = world.library.get(place.id);
    if (!bp) return;
    flattenBlueprint(
      bp,
      (pinIndex) => {
        const pin = bp.pins[pinIndex];
        return netAtPin(g, map, place.x + pin.dx, place.y + pin.dy, pin.dir);
      },
      {
        library: world.library,
        allocNet: () => growNets(nets, 1),
        emit: (kind, inNets, outNet) => {
          comps.push(
            mkComp(comps.length, kind, place.x, place.y, place.rot, inNets, outNet, instance),
          );
        },
      },
    );
  });

  for (const c of comps) {
    if (c.outNet >= 0) nets.drivers[c.outNet].push(c.idx);
  }

  world.map = map;
  world.nets = nets;
  world.comps = comps;
  world.dirty = false;
  applyInputs(world);
  commit(world);
}

// ---------------------------------------------------------------- simulation

function evaluate(c: Component, nets: NetTable, ticks: number, clockPeriod: number): V {
  switch (c.kind) {
    case Kind.Inverter: {
      const v = netValue(nets, c.inNets[0]);
      if (v === LO) return HI; // drive the net high
      if (v === HI) return Z; // let go, and the pull-down supplies the zero
      return X;
    }
    case Kind.Delay: {
      const v = netValue(nets, c.inNets[0]);
      if (v === HI) return HI;
      if (v === LO) return Z;
      return X;
    }
    case Kind.Source:
    case Kind.Switch:
      return c.state ? HI : Z;
    case Kind.Clock:
      return Math.floor(ticks / clockPeriod) % 2 === 1 ? HI : Z;
    default:
      return Z; // sinks and display devices drive nothing
  }
}

function commit(world: World): void {
  const nets = world.nets;
  nets.acc.fill(0);
  for (const c of world.comps) {
    c.out = c.next;
    if (c.outNet >= 0) nets.acc[c.outNet] |= driveBit(c.out);
  }
  for (let i = 0; i < nets.count; i++) {
    nets.value[i] = resolve(nets.acc[i], nets.pull[i] as V);
  }
}

/** One simulation tick: read every input, then commit every output at once. */
export function tick(world: World): void {
  if (world.dirty) rebuild(world);
  const { nets, comps } = world;
  for (const c of comps) c.next = evaluate(c, nets, world.ticks, world.clockPeriod);
  world.ticks++;
  commit(world);
}

export interface SettleResult {
  /** ticks that actually changed something — the circuit's propagation depth */
  ticks: number;
  /** false means it never stopped changing: the circuit oscillates */
  settled: boolean;
}

/**
 * Tick until nothing changes.
 *
 * This is how level tests run, so no level needs its delays hand-counted, and
 * a circuit that never settles fails as "this oscillates" rather than as a
 * wrong answer. A board containing a clock will never settle — sequence-mode
 * levels exist for those.
 */
export function settle(world: World, cap = 256): SettleResult {
  if (world.dirty) rebuild(world);
  let prev = new Uint8Array(world.nets.value);
  for (let i = 1; i <= cap; i++) {
    tick(world);
    const v = world.nets.value;
    let same = v.length === prev.length;
    if (same) {
      for (let j = 0; j < v.length; j++) {
        if (v[j] !== prev[j]) {
          same = false;
          break;
        }
      }
    }
    if (same) return { ticks: i - 1, settled: true };
    prev = new Uint8Array(v);
  }
  return { ticks: cap, settled: false };
}

/** Return every component and net to power-on state without touching the board. */
export function reset(world: World): void {
  world.ticks = 0;
  for (const c of world.comps) {
    c.next = Z;
    c.out = Z;
  }
  applyInputs(world);
  commit(world);
}

// ---------------------------------------------------------------- inputs

export function setInput(world: World, name: string, high: boolean): void {
  world.inputs.set(name, high);
  applyInputs(world);
  commit(world);
}

export function setInputVector(world: World, names: string[], bits: boolean[]): void {
  names.forEach((n, i) => world.inputs.set(n, !!bits[i]));
  applyInputs(world);
  commit(world);
}

/**
 * Push input state onto the source components.
 *
 * Sources assert immediately rather than after a tick: a level's input pin is
 * a terminal, not a gate, and charging it a tick of delay would inflate every
 * circuit's measured depth by one.
 */
function applyInputs(world: World): void {
  for (const c of world.comps) {
    if (c.kind !== Kind.Source && c.kind !== Kind.Switch) continue;
    if (c.pin) c.state = world.inputs.get(c.pin) ? 1 : 0;
    c.next = c.state ? HI : Z;
    c.out = c.next;
  }
}

/** Read a level output pin as a boolean. Z and X are not high. */
export function readOutput(world: World, name: string): boolean {
  for (const c of world.comps) {
    if (c.kind === Kind.Sink && c.pin === name) {
      return netValue(world.nets, c.inNets[0]) === HI;
    }
  }
  return false;
}

export function readOutputVector(world: World, names: string[]): boolean[] {
  return names.map((n) => readOutput(world, n));
}

export function readNet(world: World, net: number): V {
  return netValue(world.nets, net);
}

/** Net under a cell, for the inspect tool. */
export function netAtCell(world: World, x: number, y: number): number {
  if (!inBounds(world.grid, x, y)) return -1;
  return world.map.netA[idx(world.grid, x, y)];
}

// ---------------------------------------------------------------- undo

export interface Snapshot {
  cells: Uint16Array;
  owner: Int32Array;
  placements: Placement[];
  pinNames: [string, string][];
}

export function snapshot(world: World): Snapshot {
  return {
    cells: new Uint16Array(world.grid.cells),
    owner: new Int32Array(world.grid.owner),
    placements: world.placements.map((p) => ({ ...p })),
    pinNames: [...world.pinNames.entries()],
  };
}

export function restore(world: World, snap: Snapshot): void {
  world.grid.cells.set(snap.cells);
  world.grid.owner.set(snap.owner);
  world.placements = snap.placements.map((p) => ({ ...p }));
  world.pinNames = new Map(snap.pinNames);
  world.dirty = true;
  rebuild(world);
}

/**
 * Primitives on the board, counting inside blueprints.
 *
 * Cost cannot be hidden inside a tile: a player who wraps three inverters in a
 * blueprint still paid three inverters.
 */
export function componentCount(world: World): number {
  let n = 0;
  for (const c of world.comps) {
    if (c.kind === Kind.Inverter || c.kind === Kind.Delay) n++;
  }
  return n;
}

export function cloneWorld(world: World): World {
  const w: World = {
    ...world,
    grid: cloneGrid(world.grid),
    placements: world.placements.map((p) => ({ ...p })),
    inputs: new Map(world.inputs),
    pinNames: new Map(world.pinNames),
    dirty: true,
  };
  rebuild(w);
  return w;
}
