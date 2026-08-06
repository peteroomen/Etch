/**
 * Blueprints, as moves the search can make.
 *
 * The search enumerates primitives, which is why it can cost a D latch (6
 * parts) and cannot cost a flip-flop (two D latches and change, past any
 * enumeration budget). But a player building a flip-flop does not place twelve
 * inverters — they place two tiles. Costing what the player actually does means
 * letting the search place a tile as ONE move.
 *
 * A macro is billed at its flattened primitive count, exactly as the game bills
 * it, so nothing is hidden inside a tile here either. What it buys is search
 * depth: one move instead of six.
 */

import { Blueprint, BlueprintLibrary, primitiveCount } from '../sim/blueprint';
import { Kind } from '../sim/kinds';
import { PartKind } from './synth';
import { SeqPart } from './seq';

export interface SeqMacro {
  id: string;
  /** internal nets, indexed 0..nets-1 */
  nets: number;
  /** internal net each pin binds to, in pin order */
  pinNet: number[];
  /** whether each pin drives its host net or reads it, in pin order */
  pinRole: ('in' | 'out')[];
  parts: SeqPart[];
  /** primitives billed when this tile is placed */
  cost: number;
}

/** A placed tile: one host net per pin, in pin order. */
export interface SeqPlacement {
  macro: string;
  hosts: number[];
}

const KIND_OF: Partial<Record<Kind, PartKind>> = {
  [Kind.Inverter]: 'not',
  [Kind.Delay]: 'buf',
  [Kind.Or]: 'or',
};

/**
 * Compile a blueprint into the flat form the search uses.
 *
 * Nested blueprints are expanded here rather than at search time, so a macro is
 * always a plain list of primitives over its own nets — the same flattening the
 * game does at placement.
 */
export function compileMacro(
  bp: Blueprint,
  library: BlueprintLibrary,
): SeqMacro {
  let nets = bp.nets;
  const parts: SeqPart[] = [];

  const emit = (b: Blueprint, local: number[]) => {
    for (const part of b.parts) {
      const kind = KIND_OF[part.kind];
      if (!kind) throw new Error(`blueprint "${b.id}" uses ${Kind[part.kind]}, which the model has no cost for`);
      parts.push({
        kind,
        ins: part.inNets.map((n) => local[n]),
        out: part.outNet >= 0 ? local[part.outNet] : -1,
      });
    }
    for (const sub of b.subs ?? []) {
      const child = library.get(sub.id);
      if (!child) throw new Error(`blueprint "${b.id}" references missing sub "${sub.id}"`);
      // the child's pin i binds to this blueprint's net sub.netMap[i]; every
      // other net the child owns is fresh
      const childLocal = new Array<number>(child.nets).fill(-1);
      child.pins.forEach((pin, i) => {
        if (childLocal[pin.net] < 0) childLocal[pin.net] = local[sub.netMap[i]];
      });
      for (let i = 0; i < child.nets; i++) if (childLocal[i] < 0) childLocal[i] = nets++;
      emit(child, childLocal);
    }
  };

  emit(bp, Array.from({ length: bp.nets }, (_, i) => i));

  return {
    id: bp.id,
    nets,
    pinNet: bp.pins.map((p) => p.net),
    pinRole: bp.pins.map((p) => p.role),
    parts,
    cost: primitiveCount(bp, library),
  };
}

/**
 * Expand placed tiles into primitives over the host's nets.
 *
 * Several pins may share one internal net — an SR latch's S and Q do — so the
 * first CONNECTED host wins and an unconnected pin never clobbers it. That is
 * the same rule `flattenBlueprint` follows, and getting it wrong there silently
 * disconnected latches.
 */
export function expandPlacements(
  hostNets: number,
  placements: SeqPlacement[],
  macros: Map<string, SeqMacro>,
): { nets: number; parts: SeqPart[] } {
  let nets = hostNets;
  const parts: SeqPart[] = [];

  for (const place of placements) {
    const m = macros.get(place.macro);
    if (!m) throw new Error(`no macro "${place.macro}"`);
    const local = new Array<number>(m.nets).fill(-2);
    m.pinNet.forEach((internal, i) => {
      const host = place.hosts[i] ?? -1;
      if (local[internal] === -2 || (local[internal] < 0 && host >= 0)) local[internal] = host;
    });
    for (let i = 0; i < m.nets; i++) if (local[i] < 0) local[i] = nets++;
    for (const p of m.parts) {
      parts.push({ kind: p.kind, ins: p.ins.map((n) => local[n]), out: local[p.out] });
    }
  }
  return { nets, parts };
}

/** Total billed components of a circuit that mixes primitives and tiles. */
export function billedCost(
  primitives: number,
  placements: SeqPlacement[],
  macros: Map<string, SeqMacro>,
): number {
  return placements.reduce((n, p) => n + (macros.get(p.macro)?.cost ?? 0), primitives);
}
