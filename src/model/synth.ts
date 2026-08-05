/**
 * A superoptimiser for this substrate.
 *
 * Enumerates the real solution space of a level so balance can be measured
 * rather than guessed: the true optimum, whether a level has a genuine trade-off
 * or one dominant answer, and whether a teaching level actually requires the
 * tool it teaches.
 *
 * The model is faithful to the substrate rather than to Boolean algebra. A
 * circuit is a partition of drivers (sources and component outputs) into NETS,
 * plus each component's input net. A net's value is the OR of its drivers — so
 * putting two drivers in one net is free, and it is also the reason neither of
 * them is separately readable afterwards. That is the constraint the whole game
 * is built on, and it is what this search has to respect.
 *
 * Nets are built in topological order, so a net is closed before anything reads
 * it and the result is always a DAG.
 *
 * Truth tables are bitmasks over 2^k input rows; k is small by construction.
 */

export type PartKind = 'not' | 'buf' | 'or';

export interface Part {
  kind: PartKind;
  /** indices into the net list, all strictly earlier */
  ins: number[];
}

export interface Net {
  /** source indices driving this net */
  sources: number[];
  /** components driving this net; more than one is a free merge */
  parts: Part[];
  tt: number;
  depth: number;
}

export interface Circuit {
  k: number;
  nets: Net[];
  /** net index carrying each required output */
  outputs: number[];
}

export interface Solution {
  /** components — the game's first metric */
  parts: number;
  /** propagation depth — the game's second metric */
  depth: number;
  circuit: Circuit;
}

export interface SynthOptions {
  /** number of level inputs */
  k: number;
  /** required truth table per output */
  targets: number[];
  kinds: PartKind[];
  maxParts: number;
  maxNets?: number;
  /** parts driving a single net; two is enough for everything in the campaign */
  maxDriversPerNet?: number;
  /** search is abandoned past this many states, and reported as truncated */
  nodeBudget?: number;
}

export interface SynthResult {
  /** non-dominated (parts, depth) pairs, cheapest first */
  frontier: Solution[];
  /** every distinct (parts, depth) pair that solves it, dominated or not */
  all: { parts: number; depth: number }[];
  /** false when the node budget ran out before the space was covered */
  exhaustive: boolean;
  states: number;
}

const FULL = (k: number) => (1 << (1 << k)) - 1;

/** Truth table of input i: bit r set when input i is high in row r. */
export function sourceTable(k: number, i: number): number {
  let tt = 0;
  for (let r = 0; r < 1 << k; r++) {
    if (r & (1 << i)) tt |= 1 << r;
  }
  return tt;
}

function applyPart(kind: PartKind, ins: number[], tts: number[], mask: number): number {
  switch (kind) {
    case 'not':
      return ~tts[ins[0]] & mask;
    case 'buf':
      return tts[ins[0]];
    default:
      return tts[ins[0]] | tts[ins[1]];
  }
}

/** Every subset of the still-unassigned sources, as bitmasks. */
function subsetsOf(mask: number): number[] {
  const out: number[] = [0];
  for (let sub = mask; sub > 0; sub = (sub - 1) & mask) out.push(sub);
  return out;
}

function bitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; mask >> i; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

/**
 * Search for circuits computing every target.
 *
 * Iterative deepening on component count, so the first solutions found are the
 * cheapest, and the frontier is filled in by continuing a little past them.
 */
export function synthesise(opts: SynthOptions): SynthResult {
  const {
    k,
    targets,
    kinds,
    maxParts,
    maxNets = Math.min(7, maxParts + 2),
    maxDriversPerNet = 2,
    nodeBudget = 400_000,
  } = opts;

  const mask = FULL(k);
  const srcTT = Array.from({ length: k }, (_, i) => sourceTable(k, i));
  const allSources = (1 << k) - 1;

  const found = new Map<string, Solution>();
  let states = 0;
  let truncated = false;

  /** Cheapest part count at which we have already seen an equivalent state. */
  const seen = new Map<string, number>();

  const stateKey = (tts: number[], depths: number[], remaining: number) => {
    const pairs = tts.map((t, i) => `${t}:${depths[i]}`).sort();
    return `${remaining}|${pairs.join(',')}`;
  };

  const satisfied = (tts: number[]): number[] | null => {
    const idxs: number[] = [];
    for (const t of targets) {
      const i = tts.indexOf(t);
      if (i < 0) return null;
      idxs.push(i);
    }
    return idxs;
  };

  const record = (nets: Net[], parts: number, outputs: number[]) => {
    const depth = outputs.reduce((m, i) => Math.max(m, nets[i].depth), 0);
    const key = `${parts}/${depth}`;
    if (found.has(key)) return;
    found.set(key, {
      parts,
      depth,
      circuit: { k, nets: nets.map((n) => ({ ...n, sources: [...n.sources], parts: [...n.parts] })), outputs },
    });
  };

  const expand = (nets: Net[], tts: number[], depths: number[], remaining: number, used: number) => {
    if (states++ > nodeBudget) {
      truncated = true;
      return;
    }

    if (remaining === 0) {
      const outs = satisfied(tts);
      if (outs) record(nets, used, outs);
    }
    if (used >= maxParts || nets.length >= maxNets) return;

    const key = stateKey(tts, depths, remaining);
    const prev = seen.get(key);
    if (prev !== undefined && prev <= used) return;
    seen.set(key, used);

    // every candidate component readable from the nets that already exist
    const candidates: Part[] = [];
    for (const kind of kinds) {
      if (kind === 'or') {
        for (let a = 0; a < nets.length; a++) {
          for (let b = a; b < nets.length; b++) candidates.push({ kind, ins: [a, b] });
        }
      } else {
        for (let a = 0; a < nets.length; a++) candidates.push({ kind, ins: [a] });
      }
    }

    const srcSubsets = subsetsOf(remaining);

    for (const sub of srcSubsets) {
      const srcBits = bitsOf(sub);
      const srcTTs = srcBits.reduce((t, i) => t | srcTT[i], 0);
      const maxDrivers = Math.min(maxDriversPerNet, maxParts - used);

      for (let count = 0; count <= maxDrivers; count++) {
        if (count === 0 && sub === 0) continue; // a net with no drivers is nothing
        const choose = (start: number, picked: Part[]) => {
          if (picked.length === count) {
            let tt = srcTTs;
            let depth = 0;
            for (const p of picked) {
              tt |= applyPart(p.kind, p.ins, tts, mask);
              depth = Math.max(depth, ...p.ins.map((i) => depths[i] + 1));
            }
            // a net that repeats something already available, no sooner, is waste
            const dup = tts.findIndex((t, i) => t === tt && depths[i] <= depth);
            if (dup >= 0) return;
            // a net that is always low or always high carries no information, so
            // it is only ever worth building when it is itself an answer
            if ((tt === 0 || tt === mask) && !targets.includes(tt)) return;

            nets.push({ sources: srcBits, parts: picked.map((p) => ({ ...p, ins: [...p.ins] })), tt, depth });
            tts.push(tt);
            depths.push(depth);
            expand(nets, tts, depths, remaining & ~sub, used + picked.length);
            nets.pop();
            tts.pop();
            depths.pop();
            return;
          }
          for (let i = start; i < candidates.length; i++) {
            picked.push(candidates[i]);
            choose(i, picked); // repeats allowed: two identical parts is legal, if silly
            picked.pop();
          }
        };
        choose(0, []);
      }
    }
  };

  expand([], [], [], allSources, 0);

  const all = [...found.values()]
    .map((s) => ({ parts: s.parts, depth: s.depth }))
    .sort((a, b) => a.parts - b.parts || a.depth - b.depth);

  const frontier = [...found.values()]
    .filter((s) => ![...found.values()].some((o) => o !== s && o.parts <= s.parts && o.depth <= s.depth))
    .sort((a, b) => a.parts - b.parts || a.depth - b.depth);

  return { frontier, all, exhaustive: !truncated, states };
}

/** Human-readable netlist, for putting a witness in a report. */
export function describe(c: Circuit): string {
  const name = (i: number) => `n${i}`;
  return c.nets
    .map((net, i) => {
      const drivers = [
        ...net.sources.map((s) => String.fromCharCode(97 + s)),
        ...net.parts.map((p) =>
          p.kind === 'or'
            ? `OR(${name(p.ins[0])},${name(p.ins[1])})`
            : `${p.kind.toUpperCase()}(${name(p.ins[0])})`,
        ),
      ];
      return `${name(i)} = ${drivers.join(' | ')}`;
    })
    .join('; ');
}
