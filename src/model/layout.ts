/**
 * Does AREA actually vary?
 *
 * The other model works on netlists, so it can only see components and ticks —
 * and on those two, ten of eleven levels have a single best answer. Playtesting
 * says the same thing from the other side: the ideal component and tick counts
 * get found immediately, and the only number that moves afterwards is area.
 *
 * If area has a wide spread, the third metric is carrying the scoring model on
 * its own and that is worth knowing. If it barely moves, the three-metric
 * system is decoration and should be cut.
 *
 * This is Monte Carlo, not exhaustive: place the parts somewhere legal, route
 * the nets, keep the layouts that verify, and report the spread. A sample says
 * "at least this much variation exists" — never "this is the minimum".
 */

import { Dir, E, Kind, N, S, W, worldPins } from '../sim/kinds';
import { at, cellKind } from '../sim/grid';
import { drawStroke, linkAllPins, Point } from '../sim/draw';
import { blocked, planRoute } from '../sim/route';
import { placeComponent, rebuild } from '../sim/world';
import { Level, areaUsed, createLevelWorld, runTimeline } from '../game/level';
import { LIBRARY } from '../game/blueprints';
import { Circuit, PartKind } from './synth';

/** Deterministic RNG, so a reported spread can be reproduced exactly. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KIND_OF: Record<PartKind, Kind> = {
  not: Kind.Inverter,
  buf: Kind.Delay,
  or: Kind.Or,
};

/** The cell a pin reaches into — where wire has to arrive to connect. */
function pinTarget(x: number, y: number, dir: Dir): Point {
  return {
    x: x + (dir === E ? 1 : dir === W ? -1 : 0),
    y: y + (dir === S ? 1 : dir === N ? -1 : 0),
  };
}

interface Placed {
  x: number;
  y: number;
  rot: Dir;
  kind: Kind;
  /** net index per input pin, in pin order */
  ins: number[];
  out: number;
}

/**
 * One attempt: scatter the parts, wire the nets, see whether it verifies.
 * Returns the area when it does, or null when the attempt failed.
 */
export function tryLayout(level: Level, circuit: Circuit, rand: () => number): number | null {
  const world = createLevelWorld(level, LIBRARY);
  const g = world.grid;

  // flatten the circuit into a part list with its net indices
  const parts: { kind: PartKind; ins: number[]; out: number }[] = [];
  circuit.nets.forEach((net, netIdx) => {
    for (const p of net.parts) parts.push({ kind: p.kind, ins: p.ins, out: netIdx });
  });

  const freeCells: Point[] = [];
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!blocked(world, x, y)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length < parts.length) return null;

  const placed: Placed[] = [];
  for (const part of parts) {
    let spot: Point | null = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      const c = freeCells[Math.floor(rand() * freeCells.length)];
      if (!blocked(world, c.x, c.y) && cellKind(at(g, c.x, c.y)) === Kind.Empty) spot = c;
    }
    if (!spot) return null;
    const rot = [N, E, S, W][Math.floor(rand() * 4)] as Dir;
    const kind = KIND_OF[part.kind];
    if (!placeComponent(world, kind, spot.x, spot.y, rot)) return null;
    placed.push({ x: spot.x, y: spot.y, rot, kind, ins: part.ins, out: part.out });
  }

  // every place a given net has to reach
  const netPins = new Map<number, Point[]>();
  const addPin = (net: number, p: Point) => {
    const list = netPins.get(net);
    if (list) list.push(p);
    else netPins.set(net, [p]);
  };

  circuit.nets.forEach((net, netIdx) => {
    for (const s of net.sources) {
      const spec = level.inputs[s];
      if (!spec) return;
      addPin(netIdx, pinTarget(spec.x, spec.y, spec.rot ?? E));
    }
  });
  circuit.outputs.forEach((netIdx, i) => {
    const spec = level.outputs[i];
    if (!spec) return;
    // an output pad's input faces west when the pad faces east
    addPin(netIdx, pinTarget(spec.x, spec.y, ((((spec.rot ?? E) + 2) & 3) as Dir)));
  });
  for (const pl of placed) {
    for (const pin of worldPins(pl.kind, pl.x, pl.y, pl.rot)) {
      const net = pin.role === 'out' ? pl.out : pl.ins[worldPinInputIndex(pl, pin.name)];
      if (net === undefined) continue;
      addPin(net, pinTarget(pin.x, pin.y, pin.dir));
    }
  }

  // wire each net together, joining every pin to the growing run
  for (const [, pins] of netPins) {
    if (pins.length < 2) continue;
    const joined: Point[] = [pins[0]];
    for (let i = 1; i < pins.length; i++) {
      const target = pins[i];
      let best: Point[] | null = null;
      for (const anchor of joined) {
        const path = planRoute(world, anchor, target, 'h');
        if (path.length && (!best || path.length < best.length)) best = path;
      }
      if (!best) return null;
      drawStroke(world, best);
      joined.push(...best);
    }
  }

  linkAllPins(world);
  rebuild(world);
  const v = runTimeline(world, level);
  return v.passed ? areaUsed(world) : null;
}

/** Which input slot a named pin occupies. Pin order is the definition order. */
function worldPinInputIndex(pl: Placed, name: string): number {
  const order = pl.kind === Kind.Or ? ['a', 'b'] : ['in'];
  const i = order.indexOf(name);
  return i < 0 ? 0 : i;
}

export interface AreaSpread {
  /** how many random layouts verified */
  found: number;
  trials: number;
  min: number;
  max: number;
  median: number;
  /** what the level's own reference solution scores */
  reference: number;
}

export function sampleArea(
  level: Level,
  circuit: Circuit,
  trials = 400,
  seed = 12345,
): AreaSpread | null {
  const rand = rng(seed);
  const areas: number[] = [];
  for (let t = 0; t < trials; t++) {
    const a = tryLayout(level, circuit, rand);
    if (a !== null) areas.push(a);
  }
  const refWorld = createLevelWorld(level, LIBRARY);
  level.reference(refWorld);
  linkAllPins(refWorld);
  rebuild(refWorld);
  const reference = areaUsed(refWorld);
  if (!areas.length) return { found: 0, trials, min: 0, max: 0, median: 0, reference };
  areas.sort((a, b) => a - b);
  return {
    found: areas.length,
    trials,
    min: areas[0],
    max: areas[areas.length - 1],
    median: areas[areas.length >> 1],
    reference,
  };
}
