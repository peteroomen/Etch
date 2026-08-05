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
  /** net index carrying each required output */
  outputs: number[];
}

export interface SeqSolution {
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

export interface SeqOptions {
  spec: SeqSpec;
  kinds: PartKind[];
  maxParts: number;
  maxNets?: number;
  nodeBudget?: number;
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
): { traces: boolean[][]; worst: number; settled: boolean } {
  const cap = spec.cap ?? 64;
  const n = c.nets;
  const steps = spec.inputs.length;
  let values = new Uint8Array(n);
  const next = new Uint8Array(n);
  const partOut = new Uint8Array(c.parts.length);

  /** Recompute net values from the current part outputs and the live inputs. */
  const commit = (ins: boolean[]) => {
    next.fill(0);
    for (let s = 0; s < c.k; s++) {
      if (c.srcNet[s] >= 0 && ins[s]) next[c.srcNet[s]] = 1;
    }
    for (let p = 0; p < c.parts.length; p++) {
      if (partOut[p]) next[c.parts[p].out] = 1;
    }
  };

  const tick = (ins: boolean[]) => {
    for (let p = 0; p < c.parts.length; p++) {
      const part = c.parts[p];
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
    for (let i = 1; i <= cap; i++) {
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
  const boot = settle(spec.inputs[0]);
  if (!boot.settled) return { traces: [], worst: cap, settled: false };

  const traces: boolean[][] = Array.from({ length: n }, () => new Array(steps));
  let worst = 0;
  for (let s = 0; s < steps; s++) {
    // an input change commits without a tick, exactly as setInput does
    commit(spec.inputs[s]);
    values.set(next);
    const r = settle(spec.inputs[s]);
    if (!r.settled) return { traces: [], worst: cap, settled: false };
    if (r.ticks > worst) worst = r.ticks;
    for (let i = 0; i < n; i++) traces[i][s] = values[i] === 1;
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

/** Every distinct part available over n nets. Order fixed, so part lists can be canonicalised. */
function partCatalogue(kinds: PartKind[], n: number): SeqPart[] {
  const out: SeqPart[] = [];
  for (const kind of kinds) {
    for (let o = 0; o < n; o++) {
      if (kind === 'or') {
        for (let a = 0; a < n; a++) {
          for (let b = a; b < n; b++) out.push({ kind, ins: [a, b], out: o });
        }
      } else {
        for (let a = 0; a < n; a++) out.push({ kind, ins: [a], out: o });
      }
    }
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
  const { spec, kinds, maxParts, maxNets = Math.min(6, maxParts + 2), nodeBudget = 2_000_000 } = opts;

  const found = new Map<string, SeqSolution>();
  let states = 0;
  let truncated = false;

  for (let parts = 0; parts <= maxParts && !truncated; parts++) {
    // there are only k + parts drivers, so more nets than that leaves one empty
    const netCap = Math.min(maxNets, spec.k + parts);
    for (let nets = 1; nets <= netCap; nets++) {
      const catalogue = partCatalogue(kinds, nets);
      for (const srcNet of sourceAssignments(spec.k, nets)) {
        const chosen: SeqPart[] = [];

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
            const p = chosen[i];
            for (const a of p.ins) if (!meet(a)) return -1;
            if (!meet(p.out)) return -1;
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
          for (const s of srcNet) if (s >= 0) driven[s] = true;
          for (const p of chosen) driven[p.out] = true;
          for (let i = 0; i < nets; i++) if (!driven[i]) return;

          // a net that nothing reads is only worth building if it is an answer,
          // so no more of them may exist than the level has outputs
          const read = new Array<boolean>(nets).fill(false);
          for (const p of chosen) for (const a of p.ins) read[a] = true;
          let unread = 0;
          for (let i = 0; i < nets; i++) if (!read[i]) unread++;
          if (unread > spec.outputs.length) return;

          const sim = simulate({ k: spec.k, nets, srcNet, parts: chosen, outputs: [] }, spec);
          if (!sim.settled) return;

          const outputs: number[] = [];
          for (const want of spec.outputs) {
            const i = matchNet(sim.traces, want);
            if (i < 0) return;
            outputs.push(i);
          }
          const key = `${chosen.length}/${sim.worst}`;
          if (found.has(key)) return;
          found.set(key, {
            parts: chosen.length,
            depth: sim.worst,
            circuit: {
              k: spec.k,
              nets,
              srcNet: [...srcNet],
              parts: chosen.map((p) => ({ ...p, ins: [...p.ins] })),
              outputs,
            },
          });
        };

        const pick = (start: number) => {
          if (truncated) return;
          if (chosen.length === parts) {
            test();
            return;
          }
          for (let i = start; i < catalogue.length; i++) {
            chosen.push(catalogue[i]);
            // prune the whole subtree the moment the labelling goes out of order
            if (mentioned(chosen.length) >= 0) pick(i); // repeats allowed, permutations not
            chosen.pop();
            if (truncated) return;
          }
        };
        pick(0);
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
