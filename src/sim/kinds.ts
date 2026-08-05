/**
 * Cell kinds, directions, and the pin geometry table.
 *
 * Pin geometry is a per-kind list rather than an assumption that a component
 * is one cell, because RAM and the displays are not, and a table costs nothing
 * now against a refactor later.
 */

export type Dir = 0 | 1 | 2 | 3;
export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;

export const DIR_VEC: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

export const MASK_N = 1;
export const MASK_E = 2;
export const MASK_S = 4;
export const MASK_W = 8;

export function maskBit(d: Dir): number {
  return 1 << d;
}

export function opposite(d: Dir): Dir {
  return ((d + 2) & 3) as Dir;
}

export function rotate(d: Dir, by: Dir): Dir {
  return ((d + by) & 3) as Dir;
}

/** True when a direction lies on the east-west axis. */
export function isHorizontal(d: Dir): boolean {
  return d === E || d === W;
}

export enum Kind {
  Empty = 0,
  // wire family — these carry nets
  Wire = 1,
  Junction = 2,
  Cross = 3,
  // active components — these carry a tick of delay
  Inverter = 4,
  Delay = 5,
  // sources and sinks
  Source = 6, // a level's input pin, driven by the test runner
  Sink = 7, // a level's output pin, read by the test runner
  Switch = 8, // player-toggled, sandbox
  Clock = 9,
  // output devices
  Led = 10,
  Seg7 = 11,
  Nixie = 12,
  // a placed blueprint instance — occupies cells, flattens to primitives
  Blueprint = 13,
}

export const WIRE_FAMILY = new Set<Kind>([Kind.Wire, Kind.Junction, Kind.Cross]);

export function isWireFamily(k: Kind): boolean {
  return k === Kind.Wire || k === Kind.Junction || k === Kind.Cross;
}

/** Components that hold a tick of delay and drive an output net. */
export function isActive(k: Kind): boolean {
  return k === Kind.Inverter || k === Kind.Delay;
}

export interface PinDef {
  /** cell offset within the component's footprint, before rotation */
  dx: number;
  dy: number;
  /** which edge of that cell the pin sits on, before rotation */
  dir: Dir;
  role: 'in' | 'out';
  name: string;
}

export interface KindDef {
  kind: Kind;
  label: string;
  w: number;
  h: number;
  pins: PinDef[];
  /** false for multi-cell devices, which stay at their authored orientation */
  rotatable: boolean;
}

function io(name: string, dir: Dir, role: 'in' | 'out'): PinDef {
  return { dx: 0, dy: 0, dir, role, name };
}

/** Seven segments down the west edge and up the east edge of a 2x4 body. */
function seg7Pins(): PinDef[] {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const pins: PinDef[] = [];
  for (let i = 0; i < 4; i++) {
    pins.push({ dx: 0, dy: i, dir: W, role: 'in', name: names[i] });
  }
  for (let i = 0; i < 3; i++) {
    pins.push({ dx: 1, dy: i, dir: E, role: 'in', name: names[4 + i] });
  }
  return pins;
}

/** Ten one-hot cathodes, five down each side of a 2x5 body — a 74141's worth. */
function nixiePins(): PinDef[] {
  const pins: PinDef[] = [];
  for (let i = 0; i < 5; i++) {
    pins.push({ dx: 0, dy: i, dir: W, role: 'in', name: String(i) });
  }
  for (let i = 0; i < 5; i++) {
    pins.push({ dx: 1, dy: i, dir: E, role: 'in', name: String(5 + i) });
  }
  return pins;
}

export const KIND_DEFS: Partial<Record<Kind, KindDef>> = {
  [Kind.Inverter]: {
    kind: Kind.Inverter,
    label: 'NOT',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('in', W, 'in'), io('out', E, 'out')],
  },
  [Kind.Delay]: {
    kind: Kind.Delay,
    // A copy, not a stalling device. Fan-in consumes, so making an independent
    // driven copy of a signal is a first-class operation in this substrate.
    label: 'BUF',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('in', W, 'in'), io('out', E, 'out')],
  },
  [Kind.Source]: {
    kind: Kind.Source,
    label: 'IN',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('out', E, 'out')],
  },
  [Kind.Sink]: {
    kind: Kind.Sink,
    label: 'OUT',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('in', W, 'in')],
  },
  [Kind.Switch]: {
    kind: Kind.Switch,
    label: 'SWITCH',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('out', E, 'out')],
  },
  [Kind.Clock]: {
    kind: Kind.Clock,
    label: 'CLOCK',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('out', E, 'out')],
  },
  [Kind.Led]: {
    kind: Kind.Led,
    label: 'LED',
    w: 1,
    h: 1,
    rotatable: true,
    pins: [io('in', W, 'in')],
  },
  [Kind.Seg7]: {
    kind: Kind.Seg7,
    label: '7-SEG',
    w: 2,
    h: 4,
    rotatable: false,
    pins: seg7Pins(),
  },
  [Kind.Nixie]: {
    kind: Kind.Nixie,
    label: 'NIXIE',
    w: 2,
    h: 5,
    rotatable: false,
    pins: nixiePins(),
  },
};

export function kindDef(k: Kind): KindDef | undefined {
  return KIND_DEFS[k];
}

/**
 * A component's pins in world space, given its origin and rotation.
 *
 * Only 1x1 components rotate, so the footprint transform is the identity for
 * everything multi-cell and this stays simple.
 */
export function worldPins(
  k: Kind,
  x: number,
  y: number,
  rot: Dir,
): { x: number; y: number; dir: Dir; role: 'in' | 'out'; name: string }[] {
  const def = kindDef(k);
  if (!def) return [];
  const turn: Dir = def.rotatable ? (((rot - E) & 3) as Dir) : 0;
  return def.pins.map((p) => {
    if (turn === 0) {
      return { x: x + p.dx, y: y + p.dy, dir: p.dir, role: p.role, name: p.name };
    }
    // rotate the offset about the footprint origin (1x1 only, so it stays put)
    return { x, y, dir: rotate(p.dir, turn), role: p.role, name: p.name };
  });
}

/** Footprint cells of a component at an origin. */
export function footprint(k: Kind, x: number, y: number): { x: number; y: number }[] {
  const def = kindDef(k);
  if (!def) return [{ x, y }];
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) out.push({ x: x + dx, y: y + dy });
  }
  return out;
}
