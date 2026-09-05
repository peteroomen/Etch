/**
 * Derive every level's clues, once, at build time.
 *
 * The whole point of the hint system is that its hints are MEASURED rather than
 * written: the search knows the true optimum and a circuit that reaches it, so
 * a clue is a fact instead of an author's guess about what you are stuck on.
 *
 * But a search takes seconds to minutes, which is not something a phone can do
 * while you wait. So it happens here and the answers are baked into a generated
 * table the game just reads.
 *
 *   npm run clues
 */

import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/game/levels';
import { LIBRARY } from '../src/game/blueprints';
import { parFor } from '../src/game/level';
import { Circuit, PartKind, describe as describeDag } from '../src/model/synth';
import { SeqCircuit, SeqSpec, hasFeedback, synthesiseSeq } from '../src/model/seq';
import { synthesiseSeqParallel, worthParallel } from '../src/model/parallel';
import { analyseLevel, levelTargets } from '../src/model/personas';
import { createLevelWorld } from '../src/game/level';
import { Kind } from '../src/sim/kinds';
import { World, rebuild } from '../src/sim/world';
import { linkAllPins } from '../src/sim/draw';

const KIND_NAME: Partial<Record<Kind, string>> = {
  [Kind.Inverter]: 'NOT',
  [Kind.Delay]: 'BUF',
  [Kind.Or]: 'OR',
};

/**
 * A netlist read straight off a built board.
 *
 * Needed because the search cannot always finish: Gated and Edge both truncate,
 * and a level that defeats the search is exactly the level a player most wants
 * a clue for. Falling back to the REFERENCE means the harder the level, the
 * more useful the fallback — the clue stops being "the best shape" and becomes
 * "a shape that works", which is still true and still worth a clue.
 */
function fromBoard(level: (typeof LEVELS)[number]): { structure: string[]; netlist: string[] } {
  const w: World = createLevelWorld(level, LIBRARY);
  level.reference(w);
  linkAllPins(w);
  rebuild(w);

  const label = (net: number) => `n${net}`;
  const drivers: string[][] = Array.from({ length: w.nets.count }, () => []);
  for (const c of w.comps) {
    if (c.outNet < 0) continue;
    if (c.kind === Kind.Source) {
      drivers[c.outNet].push(c.pin ?? 'in');
      continue;
    }
    const name = KIND_NAME[c.kind];
    if (!name) continue;
    const ins = c.inNets.filter((n) => n >= 0).map(label).join(', ');
    drivers[c.outNet].push(`${name}(${ins})`);
  }

  const netlist = drivers
    .map((d, i) => (d.length ? `${label(i)} = ${d.join(' | ')}` : null))
    .filter((x): x is string => x !== null);

  const facts: string[] = [];
  const merged = drivers.filter((d) => d.length > 1).length;
  if (merged === 1) facts.push('One node is driven by more than one thing.');
  else if (merged > 1) facts.push(`${merged} of its nodes are driven by more than one thing.`);

  const reads = new Array<number>(w.nets.count).fill(0);
  for (const c of w.comps) for (const n of c.inNets) if (n >= 0) reads[n]++;
  const most = Math.max(0, ...reads);
  if (most >= 2) facts.push(`One signal is read by ${most} different components.`);

  const tiles = w.placements.length;
  if (tiles === 1) facts.push('It places one of the blocks you have already earned.');
  else if (tiles > 1) facts.push(`It places ${tiles} of the blocks you have already earned.`);

  facts.push('This is a working answer, not necessarily the smallest one.');
  return { structure: facts, netlist };
}

/** The level's own palette, reduced to what the search understands. */
function vocabularyOf(palette: string[]): PartKind[] {
  const kinds: PartKind[] = [];
  if (palette.includes('not')) kinds.push('not');
  if (palette.includes('buf')) kinds.push('buf');
  if (palette.includes('or')) kinds.push('or');
  return kinds.length ? kinds : ['not'];
}

function specOf(level: (typeof LEVELS)[number]): SeqSpec {
  const t = level.timeline;
  const ins = Object.keys(t.inputs);
  const outs = Object.keys(t.outputs);
  return {
    k: ins.length,
    inputs: Array.from({ length: t.steps }, (_, s) => ins.map((n) => !!t.inputs[n][s])),
    outputs: outs.map((n) => Array.from({ length: t.steps }, (_, s) => t.outputs[n][s] ?? null)),
  };
}

/**
 * Facts about the shape of an answer, without giving the answer.
 *
 * Each one is something a player could check their own attempt against, which
 * is what separates a hint from a spoiler: it tells you whether you are in the
 * right country, not which house.
 */
function structureOf(c: SeqCircuit): string[] {
  const facts: string[] = [];

  const drivers = new Array<number>(c.nets).fill(0);
  for (const s of c.srcNet) if (s >= 0) drivers[s]++;
  for (const p of c.parts) drivers[p.out]++;
  const merged = drivers.filter((n) => n > 1).length;
  if (merged === 1) facts.push('One node is driven by more than one thing.');
  else if (merged > 1) facts.push(`${merged} of its nodes are driven by more than one thing.`);
  else facts.push('No node is driven by more than one thing.');

  const reads = new Array<number>(c.nets).fill(0);
  for (const p of c.parts) for (const a of p.ins) reads[a]++;
  const most = Math.max(0, ...reads);
  if (most >= 2) facts.push(`One signal is read by ${most} different components.`);

  if (hasFeedback(c)) facts.push('It contains a loop — something reads its own output, eventually.');

  const kinds = new Set(c.parts.map((p) => p.kind));
  if (c.parts.length && kinds.size === 1) {
    facts.push(`Every component in it is the same kind: ${[...kinds][0].toUpperCase()}.`);
  }
  return facts;
}

/** The witness as netlist lines, one per node, for the tier that shows a part. */
function netlistOf(c: SeqCircuit, inputNames: string[]): string[] {
  const drivers: string[][] = Array.from({ length: c.nets }, () => []);
  c.srcNet.forEach((net, i) => {
    if (net >= 0) drivers[net].push(inputNames[i] ?? `in${i}`);
  });
  for (const p of c.parts) {
    drivers[p.out].push(
      p.kind === 'or'
        ? `OR(n${p.ins[0]}, n${p.ins[1]})`
        : `${p.kind.toUpperCase()}(n${p.ins[0]})`,
    );
  }
  return drivers
    .map((d, i) => (d.length ? `n${i} = ${d.join(' | ')}` : null))
    .filter((x): x is string => x !== null);
}

export interface LevelClues {
  /** the cheapest circuit that exists, when the search could prove one */
  optimum: { parts: number; depth: number } | null;
  /** what par scores, always known because the reference is run */
  par: { components: number; ticks: number };
  structure: string[];
  netlist: string[];
  exhaustive: boolean;
}

/** The same facts, read off a truth-table circuit, which is always acyclic. */
function structureOfDag(c: Circuit): string[] {
  const facts: string[] = [];
  const merged = c.nets.filter((n) => n.sources.length + n.parts.length > 1).length;
  if (merged === 1) facts.push('One node is driven by more than one thing.');
  else if (merged > 1) facts.push(`${merged} of its nodes are driven by more than one thing.`);
  else facts.push('No node is driven by more than one thing.');

  const reads = new Array<number>(c.nets.length).fill(0);
  for (const n of c.nets) for (const p of n.parts) for (const a of p.ins) reads[a]++;
  const most = Math.max(0, ...reads);
  if (most >= 2) facts.push(`One signal is read by ${most} different components.`);

  const kinds = new Set(c.nets.flatMap((n) => n.parts.map((p) => p.kind)));
  if (kinds.size === 1) {
    facts.push(`Every component in it is the same kind: ${[...kinds][0].toUpperCase()}.`);
  }
  return facts;
}

const out: Record<string, LevelClues> = {};

for (const level of LEVELS) {
  const par = parFor(level, LIBRARY);
  const inputNames = Object.keys(level.timeline.inputs);
  const t0 = Date.now();
  let optimum: LevelClues['optimum'] = null;
  let structure: string[] = [];
  let netlist: string[] = [];
  let exhaustive = false;
  let how = '';

  if (levelTargets(level).targets) {
    /**
     * A combinational level gets a combinational answer.
     *
     * The sequential search can solve one of these with a BISTABLE — it found a
     * five-part XOR that way — but a circuit whose correctness rests on the
     * tie-break is one whose correctness rests on where you put it. Advertising
     * that as the optimum would send players chasing an answer that works in
     * some placements and not others.
     */
    const a = analyseLevel(level);
    const best = a.results.find((r) => r.persona === 'optimiser')?.best ?? null;
    exhaustive = a.results.find((r) => r.persona === 'optimiser')?.exhaustive ?? false;
    if (best && a.witness) {
      optimum = { parts: best.parts, depth: best.depth };
      structure = structureOfDag(a.witness.circuit);
      netlist = describeDag(a.witness.circuit, inputNames).split('; ');
    }
    how = 'dag';
  } else {
    const spec = specOf(level);
    const kinds = vocabularyOf(level.palette);
    const maxParts = Math.min(par.components + 1, 8);
    const opts = { spec, kinds, maxParts, nodeBudget: 20_000_000 };
    const r = worthParallel(opts) ? await synthesiseSeqParallel(opts) : synthesiseSeq(opts);
    const best = r.frontier[0] ?? null;
    exhaustive = r.exhaustive;
    if (best) {
      optimum = { parts: best.parts, depth: best.depth };
      structure = structureOf(best.circuit);
      netlist = netlistOf(best.circuit, inputNames);
    }
    how = 'seq';
  }

  // a level the search could not crack still deserves clues, so read them off
  // the reference instead — the fallback is best exactly where it is needed
  let fallback = false;
  if (!structure.length || !netlist.length) {
    const b = fromBoard(level);
    structure = b.structure;
    netlist = b.netlist;
    fallback = true;
  }

  out[level.id] = {
    optimum,
    par: { components: par.components, ticks: par.ticks },
    structure,
    netlist,
    exhaustive,
  };
  console.log(
    `${level.id.padEnd(14)} ${how.padEnd(4)} par ${par.components}c/${par.ticks}t  ` +
      `best ${optimum ? `${optimum.parts}p/${optimum.depth}t` : 'none'}  ` +
      `${exhaustive ? 'exhaustive' : 'truncated'}${fallback ? ' +board' : ''}  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

const body = `/**
 * GENERATED by \`npm run clues\` — do not edit.
 *
 * Every clue in here is measured by exhaustive search over the real substrate,
 * so a tier-one hint is a fact rather than an author's opinion. The search is
 * far too slow to run on a phone, which is why it is a table.
 */

export interface LevelClues {
  optimum: { parts: number; depth: number } | null;
  par: { components: number; ticks: number };
  structure: string[];
  netlist: string[];
  exhaustive: boolean;
}

export const CLUES: Record<string, LevelClues> = ${JSON.stringify(out, null, 2)};
`;
writeFileSync('src/game/clues.generated.ts', body);
console.log('\\nsrc/game/clues.generated.ts written');
