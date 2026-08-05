/**
 * Blueprints — the progression mechanic.
 *
 * A blueprint is stored as a netlist, not a grid: internal nets, primitive
 * parts wired between them, and pins that bind to the host board. Placement
 * FLATTENS it, appending its primitives to the world's component list, so the
 * tick loop only ever sees primitives. No recursion at runtime, no nested
 * state, no per-instance scheduling.
 *
 * Delay is therefore honest. An AND built from three inverters settles in two
 * ticks wherever it is placed, which is what makes a tick par mean anything.
 *
 * A grid-authored blueprint compiles down to exactly this shape, so adding the
 * authoring UI later is additive — it produces netlists, it doesn't change how
 * they are consumed.
 */

import { Dir, Kind } from './kinds';
import type { Component } from './world';

export interface BlueprintPin {
  name: string;
  /** offset within the blueprint's footprint */
  dx: number;
  dy: number;
  /** which edge of that cell the pin sits on */
  dir: Dir;
  role: 'in' | 'out';
  /** the internal net this pin is */
  net: number;
}

export interface BlueprintPart {
  kind: Kind;
  inNets: number[];
  outNet: number;
}

/** A nested blueprint: its pin i binds to this blueprint's internal net netMap[i]. */
export interface BlueprintSub {
  id: string;
  netMap: number[];
}

export interface Blueprint {
  id: string;
  /** shown in the palette */
  label: string;
  /** shown in the unlock modal */
  name: string;
  w: number;
  h: number;
  /** count of internal nets, indexed 0..nets-1 */
  nets: number;
  pins: BlueprintPin[];
  parts: BlueprintPart[];
  subs?: BlueprintSub[];
}

export type BlueprintLibrary = ReadonlyMap<string, Blueprint>;

export class BlueprintCycleError extends Error {
  constructor(public readonly chain: string[]) {
    super(`Blueprint cycle: ${chain.join(' -> ')}`);
    this.name = 'BlueprintCycleError';
  }
}

export interface FlattenContext {
  library: BlueprintLibrary;
  /** allocate a fresh host net and return its id */
  allocNet: () => number;
  /** emit a flattened primitive */
  emit: (kind: Kind, inNets: number[], outNet: number) => void;
}

/**
 * Flatten one blueprint into primitives.
 *
 * `hostForPin` maps each of the blueprint's pins to a net on the host board
 * (or -1 where the pin faces nothing). Every other internal net gets a fresh
 * host net, so two instances of the same blueprint never share internals.
 */
export function flattenBlueprint(
  bp: Blueprint,
  hostForPin: (pinIndex: number) => number,
  ctx: FlattenContext,
  chain: string[] = [],
): void {
  if (chain.includes(bp.id)) throw new BlueprintCycleError([...chain, bp.id]);
  const nextChain = [...chain, bp.id];

  const local: number[] = new Array(bp.nets).fill(-2); // -2 = not yet assigned

  bp.pins.forEach((pin, i) => {
    local[pin.net] = hostForPin(i);
  });
  for (let i = 0; i < bp.nets; i++) {
    if (local[i] === -2) local[i] = ctx.allocNet();
  }

  for (const part of bp.parts) {
    ctx.emit(
      part.kind,
      part.inNets.map((n) => local[n]),
      part.outNet >= 0 ? local[part.outNet] : -1,
    );
  }

  for (const sub of bp.subs ?? []) {
    const subBp = ctx.library.get(sub.id);
    if (!subBp) throw new Error(`Blueprint "${bp.id}" references missing sub "${sub.id}"`);
    flattenBlueprint(subBp, (i) => local[sub.netMap[i]], ctx, nextChain);
  }
}

/**
 * Total primitive count of a blueprint, counting nested ones.
 * Used for component-par scoring, so a player cannot hide cost inside a tile.
 */
export function primitiveCount(bp: Blueprint, library: BlueprintLibrary, chain: string[] = []): number {
  if (chain.includes(bp.id)) throw new BlueprintCycleError([...chain, bp.id]);
  const nextChain = [...chain, bp.id];
  let n = bp.parts.length;
  for (const sub of bp.subs ?? []) {
    const subBp = library.get(sub.id);
    if (!subBp) throw new Error(`Blueprint "${bp.id}" references missing sub "${sub.id}"`);
    n += primitiveCount(subBp, library, nextChain);
  }
  return n;
}

/** Components belonging to a given blueprint instance, for rendering and inspect. */
export function instanceParts(comps: Component[], instance: number): Component[] {
  return comps.filter((c) => c.instance === instance);
}
