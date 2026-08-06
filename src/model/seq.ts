/**
 * The superoptimiser, for circuits that remember.
 *
 * `synth.ts` builds nets in topological order, which makes every circuit it can
 * express a DAG. That is a fine model of combinational logic and a complete
 * blind spot for chapter 4 — a latch IS a cycle, so the existing search cannot
 * represent one, let alone cost it.
 *
 * This search drops the ordering constraint: a part may read any net, including
 * the one it drives. What replaces the truth table is SIMULATION. A circuit is
 * run against the level's actual timeline, tick for tick, using the same
 * synchronous update the game uses — every part reads, then every net commits —
 * so a ring that oscillates in the game oscillates here too, and for the same
 * reason.
 *
 * That equivalence is the whole point. A par derived here is reachable on a real
 * board, and an oscillation found here is one a player would hit.
 *
 * The cost is that behaviour is no longer a 32-bit truth table, so the
 * dominance memo that makes the combinational search fast does not apply.
 * Enumeration is bounded instead: small part counts, small net counts, and a
 * node budget that reports truncation rather than lying about exhaustiveness.
 */

import { PartKind } from './synth';
import { SeqMacro, SeqPlacement, expandPlacements } from './macro';

export interface SeqPart {
  kind: PartKind;
  /** net indices read; unordered for OR, single for NOT and BUF */
  ins: number[];
  /** net index driven */
  out: number;
}

export interface SeqCircuit {
  k: number;
  nets: number;
  /** net each source drives, or -1 when the source is unused */
  srcNet: number[];
  parts: SeqPart[];
  /** blueprint tiles placed on the host nets, billed at their primitive count */
  placements?: SeqPlacement[];
  /** net index carrying each required output */
  outputs: number[];
}

export interface SeqSolution {
  /** billed components: loose primitives plus everything inside every tile */
  parts: number;
  /** worst settle depth across the timeline — the game's tick metric */
  depth: number;
  circuit: SeqCircuit;
}

/** A level's test, in the shape the search needs it. */
export interface SeqSpec {
  k: number;
  /** [step][input] */
  inputs: boolean[][];
  /** [output][step], null meaning don't care */
  outputs: (boolean | null)[][];
  /** ticks allowed per step before a circuit is called oscillating */
  cap?: number;
}

/**
 * How a tick resolves.
 *
 * `simultaneous` — every part reads, then every net commits. Ticks then measure
 * true logic depth, which is what makes a tick par mean something. Its cost is
 * that a symmetric feedback loop can never break its own tie.
 *
 * `ordered` — parts update one at a time in board order, each net settling
 * before the next part reads it. Cross-coupled pairs resolve, like a unit-delay
 * gate simulator. Its cost is that a chain laid out along the scan order
 * propagates in ONE tick, so ticks stop measuring depth.
 *
 * `seeded` — one ordered pass at power-on to break the all-zero symmetry, then
 * simultaneous forever after. Keeps depth honest and still starts defined.
 *
 * `tiebreak` — simultaneous, until the state is caught repeating with period 2.
 * That is what a symmetric loop does and what nothing else does, so one ordered
 * pass is applied to break it and simultaneous update resumes. Any circuit that
 * has a fixed point never reaches the tie-break, so every existing tick par is
 * untouched; only circuits that genuinely have no simultaneous answer are
 * decided by board order — which is exactly what mismatched gate delays decide
 * in real hardware.
 */
export type UpdateMode = 'simultaneous' | 'ordered' | 'seeded' | 'tiebreak';

export interface SeqOptions {
  spec: SeqSpec;
  kinds: PartKind[];
  /** budget in BILLED components — a tile spends its whole primitive count */
  maxParts: number;
  maxNets?: number;
  nodeBudget?: number;
  /** blueprints the player owns, placeable as one move each */
  macros?: SeqMacro[];
  /** how a tick resolves; the search must assume the same rule the game uses */
  mode?: UpdateMode;
}

export interface SeqResult {
  frontier: SeqSolution[];
  all: { parts: number; depth: number }[];
  exhaustive: boolean;
  states: number;
}

// ---------------------------------------------------------------- simulation

/**
 * Run a circuit against a spec.
 *
 * Mirrors the game exactly: `reset` zeroes every net, setting an input commits
 * immediately (an input is a driver, not a component, so it costs no tick), and
 * `settle` counts the ticks that actually changed something. A step that never
 * stops changing makes the whole run unsettled, which is a failure — the same
 * verdict `runTimeline` gives a player.
 */
export function simulate(
  c: SeqCircuit,
  spec: SeqSpec,
  macros?: Map<string, SeqMacro>,
  mode: UpdateMode = 'simultaneous',
): { traces: boolean[][]; worst: number; settled: boolean } {
  const cap = spec.cap ?? 64;
  // tiles expand to primitives over fresh nets, exactly as the game flattens
  // them at placement; only the HOST nets are wireable, so only those are
  // traced for output matching
  const ex =
    c.placements && c.placements.length
      ? expandPlacements(c.nets, c.placements, macros ?? new Map())
      : { nets: c.nets, parts: [] as SeqPart[] };
  const hostNets = c.nets;
  const n = ex.nets;
  const allParts = c.parts.concat(ex.parts);
  const steps = spec.inputs.length;
  let values = new Uint8Array(n);
  const next = new Uint8Array(n);
  const partOut = new Uint8Array(allParts.length);

  /** Which parts drive each net, for recomputing one net at a time. */
  const driversOf: number[][] = Array.from({ length: n }, () => []);
  allParts.forEach((p, i) => {
    if (p.out >= 0) driversOf[p.out].push(i);
  });

  const evalPart = (i: number, read: Uint8Array): number => {
    const part = allParts[i];
    switch (part.kind) {
      case 'not':
        return read[part.ins[0]] ? 0 : 1;
      case 'buf':
        return read[part.ins[0]];
      default:
        return read[part.ins[0]] || read[part.ins[1]] ? 1 : 0;
    }
  };

  /**
   * One ordered pass: each part updates and its net settles before the next
   * part reads it, so a cross-coupled pair resolves instead of ringing.
   */
  const orderedPass = (ins: boolean[]) => {
    for (let i = 0; i < allParts.length; i++) {
      partOut[i] = evalPart(i, values);
      const out = allParts[i].out;
      if (out < 0) continue;
      let v = 0;
      for (let s = 0; s < c.k; s++) if (c.srcNet[s] === out && ins[s]) v = 1;
      for (const d of driversOf[out]) if (partOut[d]) v = 1;
      values[out] = v;
    }
  };

  /** Recompute net values from the current part outputs and the live inputs. */
  const commit = (ins: boolean[]) => {
    next.fill(0);
    for (let s = 0; s < c.k; s++) {
      if (c.srcNet[s] >= 0 && ins[s]) next[c.srcNet[s]] = 1;
    }
    for (let p = 0; p < allParts.length; p++) {
      if (partOut[p]) next[allParts[p].out] = 1;
    }
  };

  const tick = (ins: boolean[]) => {
    for (let p = 0; p < allParts.length; p++) {
      const part = allParts[p];
      switch (part.kind) {
        case 'not':
          partOut[p] = values[part.ins[0]] ? 0 : 1;
          break;
        case 'buf':
          partOut[p] = values[part.ins[0]];
          break;
        default:
          partOut[p] = values[part.ins[0]] || values[part.ins[1]] ? 1 : 0;
      }
    }
    commit(ins);
  };

  const settle = (ins: boolean[]): { ticks: number; settled: boolean } => {
    let twoAgo: Uint8Array | null = null;
    let oneAgo: Uint8Array | null = null;
    for (let i = 1; i <= cap; i++) {
      if (mode === 'tiebreak') {
        const before = Uint8Array.from(values);
        tick(ins);
        values.set(next);
        let same = true;
        for (let j = 0; j < n; j++) {
          if (before[j] !== values[j]) {
            same = false;
            break;
          }
        }
        if (same) return { ticks: i - 1, settled: true };
        // a state seen two ticks ago and not since is a period-2 ring: no
        // simultaneous fixed point exists, so let board order decide it
        if (twoAgo) {
          let cycling = true;
          for (let j = 0; j < n; j++) {
            if (twoAgo[j] !== values[j]) {
              cycling = false;
              break;
            }
          }
          if (cycling) orderedPass(ins);
        }
        twoAgo = oneAgo;
        oneAgo = Uint8Array.from(values);
        continue;
      }
      if (mode === 'ordered') {
        const before = Uint8Array.from(values);
        orderedPass(ins);
        let same = true;
        for (let j = 0; j < n; j++) {
          if (before[j] !== values[j]) {
            same = false;
            break;
          }
        }
        if (same) return { ticks: i - 1, settled: true };
        continue;
      }
      tick(ins);
      let same = true;
      for (let j = 0; j < n; j++) {
        if (next[j] !== values[j]) {
          same = false;
          break;
        }
      }
      values.set(next);
      if (same) return { ticks: i - 1, settled: true };
    }
    return { ticks: cap, settled: false };
  };

  // power-on: every net low, step-0 inputs applied, then settle
  values = new Uint8Array(n);
  partOut.fill(0);
  commit(spec.inputs[0]);
  values.set(next);
  // one ordered pass at power-on breaks the all-zero symmetry that a
  // cross-coupled pair cannot break for itself
  if (mode === 'seeded') orderedPass(spec.inputs[0]);
  const boot = settle(spec.inputs[0]);
  if (!boot.settled) return { traces: [], worst: cap, settled: false };

  // only host nets are wireable, so only those may carry a required output
  const traces: boolean[][] = Array.from({ length: hostNets }, () => new Array(steps));
  let worst = 0;
  for (let s = 0; s < steps; s++) {
    // an input change commits without a tick, exactly as setInput does
    commit(spec.inputs[s]);
    values.set(next);
    const r = settle(spec.inputs[s]);
    if (!r.settled) return { traces: [], worst: cap, settled: false };
    if (r.ticks > worst) worst = r.ticks;
    for (let i = 0; i < hostNets; i++) traces[i][s] = values[i] === 1;
  }
  return { traces, worst, settled: true };
}

/** Which net, if any, carries a required output sequence. */
function matchNet(traces: boolean[][], want: (boolean | null)[]): number {
  for (let i = 0; i < traces.length; i++) {
    let ok = true;
    for (let s = 0; s < want.length; s++) {
      if (want[s] !== null && want[s] !== traces[i][s]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

// ---------------------------------------------------------------- enumeration

/** Every way to assign k sources to n nets, or to leave one out. */
function sourceAssignments(k: number, n: number): number[][] {
  const out: number[][] = [];
  const rec = (i: number, acc: number[]) => {
    if (i === k) {
      out.push([...acc]);
      return;
    }
    for (let net = -1; net < n; net++) {
      acc.push(net);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/**
 * One move the search can make: a loose primitive, or a whole tile.
 *
 * A tile costs what it bills — its flattened primitive count — so it competes
 * with primitives on the game's own terms rather than being free structure.
 */
type Move =
  | { tile: false; part: SeqPart; cost: number }
  | { tile: true; place: SeqPlacement; nets: number[]; roles: ('in' | 'out')[]; cost: number };

/** Every distinct move available over n nets. Order fixed, so lists can be canonicalised. */
function moveCatalogue(kinds: PartKind[], n: number, macros: SeqMacro[]): Move[] {
  const out: Move[] = [];
  for (const kind of kinds) {
    for (let o = 0; o < n; o++) {
      if (kind === 'or') {
        for (let a = 0; a < n; a++) {
          for (let b = a; b < n; b++) out.push({ tile: false, part: { kind, ins: [a, b], out: o }, cost: 1 });
        }
      } else {
        for (let a = 0; a < n; a++) out.push({ tile: false, part: { kind, ins: [a], out: o }, cost: 1 });
      }
    }
  }
  for (const m of macros) {
    const hosts: number[] = new Array(m.pinNet.length).fill(0);
    const rec = (i: number) => {
      if (i === hosts.length) {
        out.push({
          tile: true,
          place: { macro: m.id, hosts: [...hosts] },
          nets: [...hosts],
          roles: m.pinRole,
          cost: m.cost,
        });
        return;
      }
      for (let net = 0; net < n; net++) {
        hosts[i] = net;
        rec(i + 1);
      }
    };
    rec(0);
  }
  return out;
}

/**
 * Search for circuits satisfying a sequential spec.
 *
 * Iterative deepening on part count, and for each count every net count up to
 * the cap, so the first solutions found are the cheapest. Part lists are drawn
 * in catalogue order with repeats allowed, which enumerates each multiset once
 * rather than once per permutation.
 */
export function synthesiseSeq(opts: SeqOptions): SeqResult {
  const {
    spec,
    kinds,
    maxParts,
    maxNets = Math.min(6, maxParts + 2),
    nodeBudget = 2_000_000,
    macros = [],
    mode = 'simultaneous',
  } = opts;
  const macroBy = new Map(macros.map((m) => [m.id, m]));

  const found = new Map<string, SeqSolution>();
  let states = 0;
  let truncated = false;

  for (let parts = 0; parts <= maxParts && !truncated; parts++) {
    // there are only k + parts drivers, so more nets than that leaves one empty
    const netCap = Math.min(maxNets, spec.k + parts);
    for (let nets = 1; nets <= netCap; nets++) {
      const catalogue = moveCatalogue(kinds, nets, macros);
      for (const srcNet of sourceAssignments(spec.k, nets)) {
        const chosen: Move[] = [];

        /**
         * How many distinct nets the prefix has mentioned, in index order, or
         * -1 if it mentions one out of order.
         *
         * Net labels are arbitrary, so most candidates are relabellings of one
         * another. Requiring first mention in index order keeps exactly one
         * labelling of each shape and discards the other (n-1)!. It is a PREFIX
         * property — a part list that breaks the order cannot be fixed by
         * appending — so it prunes the tree rather than filtering the leaves,
         * which is the difference between answering the D latch and truncating.
         */
        const mentioned = (upto: number): number => {
          let seen = 0;
          const meet = (net: number): boolean => {
            if (net < 0 || net < seen) return true;
            if (net !== seen) return false;
            seen++;
            return true;
          };
          for (const s of srcNet) if (!meet(s)) return -1;
          for (let i = 0; i < upto; i++) {
            const m = chosen[i];
            if (m.tile) {
              for (const h of m.nets) if (!meet(h)) return -1;
            } else {
              for (const a of m.part.ins) if (!meet(a)) return -1;
              if (!meet(m.part.out)) return -1;
            }
          }
          return seen;
        };

        const test = () => {
          if (states++ > nodeBudget) {
            truncated = true;
            return;
          }
          // every net has to be reached, or this is a smaller circuit in disguise
          if (mentioned(chosen.length) !== nets) return;
          // every net must be driven by something, or it is a net that is not there
          const driven = new Array<boolean>(nets).fill(false);
          const read = new Array<boolean>(nets).fill(false);
          for (const s of srcNet) if (s >= 0) driven[s] = true;
          for (const m of chosen) {
            if (m.tile) {
              m.nets.forEach((h, i) => {
                if (m.roles[i] === 'out') driven[h] = true;
                else read[h] = true;
              });
            } else {
              driven[m.part.out] = true;
              for (const a of m.part.ins) read[a] = true;
            }
          }
          for (let i = 0; i < nets; i++) if (!driven[i]) return;

          // a net that nothing reads is only worth building if it is an answer,
          // so no more of them may exist than the level has outputs
          let unread = 0;
          for (let i = 0; i < nets; i++) if (!read[i]) unread++;
          if (unread > spec.outputs.length) return;

          const loose = chosen.filter((m): m is Extract<Move, { tile: false }> => !m.tile);
          const tiles = chosen.filter((m): m is Extract<Move, { tile: true }> => m.tile);
          const circuit = {
            k: spec.k,
            nets,
            srcNet: [...srcNet],
            parts: loose.map((m) => ({ ...m.part, ins: [...m.part.ins] })),
            placements: tiles.map((m) => ({ macro: m.place.macro, hosts: [...m.place.hosts] })),
            outputs: [] as number[],
          };
          const sim = simulate(circuit, spec, macroBy, mode);
          if (!sim.settled) return;

          const outputs: number[] = [];
          for (const want of spec.outputs) {
            const i = matchNet(sim.traces, want);
            if (i < 0) return;
            outputs.push(i);
          }
          const billed = chosen.reduce((n, m) => n + m.cost, 0);
          const key = `${billed}/${sim.worst}`;
          if (found.has(key)) return;
          found.set(key, {
            parts: billed,
            depth: sim.worst,
            circuit: { ...circuit, outputs },
          });
        };

        // spend the budget exactly: a tile consumes its whole billed cost
        const pick = (start: number, remaining: number) => {
          if (truncated) return;
          if (remaining === 0) {
            test();
            return;
          }
          for (let i = start; i < catalogue.length; i++) {
            const move = catalogue[i];
            if (move.cost > remaining) continue;
            chosen.push(move);
            // prune the whole subtree the moment the labelling goes out of order
            if (mentioned(chosen.length) >= 0) pick(i, remaining - move.cost);
            chosen.pop();
            if (truncated) return;
          }
        };
        pick(0, parts);
        if (truncated) break;
      }
      if (truncated) break;
    }
    // cheapest-first: once a part count yields anything, deeper counts only
    // matter for the tick end of the frontier, which one more level covers
    if (found.size > 0 && parts >= smallest(found) + 1) break;
  }

  const all = [...found.values()]
    .map((s) => ({ parts: s.parts, depth: s.depth }))
    .sort((a, b) => a.parts - b.parts || a.depth - b.depth);
  const frontier = [...found.values()]
    .filter((s) => ![...found.values()].some((o) => o !== s && o.parts <= s.parts && o.depth <= s.depth))
    .sort((a, b) => a.parts - b.parts || a.depth - b.depth);

  return { frontier, all, exhaustive: !truncated, states };
}

function smallest(found: Map<string, SeqSolution>): number {
  return Math.min(...[...found.values()].map((s) => s.parts));
}

/** Human-readable netlist of a sequential circuit, feedback and all. */
export function describeSeq(c: SeqCircuit, inputNames?: string[], outputNames?: string[]): string {
  const nm = (i: number) => `n${i}`;
  const drivers: string[][] = Array.from({ length: c.nets }, () => []);
  c.srcNet.forEach((net, s) => {
    if (net >= 0) drivers[net].push(inputNames?.[s] ?? `in${s}`);
  });
  for (const p of c.parts) {
    drivers[p.out].push(
      p.kind === 'or'
        ? `OR(${nm(p.ins[0])},${nm(p.ins[1])})`
        : `${p.kind.toUpperCase()}(${nm(p.ins[0])})`,
    );
  }
  const nets = drivers.map((d, i) => `${nm(i)} = ${d.join(' | ')}`).join('; ');
  const outs = c.outputs.map((n, i) => `${outputNames?.[i] ?? `q${i}`}=${nm(n)}`).join(', ');
  return `${nets}  ->  ${outs}`;
}

/** True when any part reads a net that is driven downstream of itself. */
export function hasFeedback(c: SeqCircuit): boolean {
  // reachability over "part p reads net a, which is driven by part q"
  const drivenBy: number[][] = Array.from({ length: c.nets }, () => []);
  c.parts.forEach((p, i) => drivenBy[p.out].push(i));
  const seen = new Set<string>();
  const reaches = (from: number, target: number): boolean => {
    const key = `${from}>${target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const net of c.parts[from].ins) {
      for (const q of drivenBy[net]) {
        if (q === target) return true;
        if (reaches(q, target)) return true;
      }
    }
    return false;
  };
  return c.parts.some((_, i) => reaches(i, i));
}
