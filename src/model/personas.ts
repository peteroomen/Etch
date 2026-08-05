/**
 * Balance modelling.
 *
 * These are not simulated humans. A persona here is a POLICY over the solution
 * space — a restricted vocabulary and a budget — and what it measures is a
 * property of the level, not of a player. "Wire-only needs eight components for
 * XOR where the full vocabulary needs six" is a statement about XOR.
 *
 * What this buys that playtesting cannot:
 *   - the true optimum, so par can be checked for reachability and headroom
 *   - what a level's new tool actually SAVES, which is whether it teaches anything
 *   - whether a level has a real trade-off or one dominant answer, which decides
 *     whether its three metrics mean anything there
 */

import { Level, Score, parFor } from '../game/level';
import { LIBRARY } from '../game/blueprints';
import { PartKind, Solution, synthesise } from './synth';

export interface Persona {
  id: string;
  name: string;
  kinds: PartKind[];
  reads: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'wire-only',
    name: 'Wire-only',
    kinds: ['not'],
    reads: 'Inverters and merging, nothing else. A copy still exists here — it just costs two inverters instead of one BUF.',
  },
  {
    id: 'copier',
    name: 'Copier',
    kinds: ['not', 'buf'],
    reads: 'Buys independent copies with BUF when fan-in bites.',
  },
  {
    id: 'gater',
    name: 'Gater',
    kinds: ['not', 'or'],
    reads: 'Spends OR gates instead of copies.',
  },
  {
    id: 'optimiser',
    name: 'Optimiser',
    kinds: ['not', 'buf', 'or'],
    reads: 'The whole vocabulary, searched to the frontier. This is the true optimum.',
  },
];

/** The search gets expensive fast in the number of inputs, so budget by k. */
export function budgetFor(k: number): { maxParts: number; nodeBudget: number } {
  if (k <= 1) return { maxParts: 6, nodeBudget: 500_000 };
  if (k === 2) return { maxParts: 9, nodeBudget: 4_000_000 };
  // three inputs blows up fast, so the claim is narrower: "nothing at or below
  // five components", which is enough to pin every level that fits at all
  return { maxParts: 5, nodeBudget: 12_000_000 };
}

export interface LevelTargets {
  k: number;
  inputs: string[];
  outputs: string[];
  /** truth table per output, or null when the timeline is not a full sweep */
  targets: number[] | null;
  why?: string;
}

/**
 * Recover each output's truth table from the level's timeline.
 *
 * Only works when the timeline visits every input combination exactly once,
 * which is what `truthTimeline` produces. Anything with state is outside a
 * combinational search, and says so rather than guessing.
 */
export function levelTargets(level: Level): LevelTargets {
  const inputs = level.inputs.map((p) => p.name);
  const outputs = level.outputs.map((p) => p.name);
  const k = inputs.length;
  const rows = 1 << k;
  const t = level.timeline;

  if (t.steps !== rows) {
    return { k, inputs, outputs, targets: null, why: `timeline has ${t.steps} steps, not ${rows}` };
  }
  if (k > 3) {
    return { k, inputs, outputs, targets: null, why: `${k} inputs is beyond the search budget` };
  }

  const seen = new Set<number>();
  const tables = outputs.map(() => 0);

  for (let s = 0; s < t.steps; s++) {
    let combo = 0;
    inputs.forEach((n, i) => {
      if (t.inputs[n][s]) combo |= 1 << i;
    });
    if (seen.has(combo)) {
      return { k, inputs, outputs, targets: null, why: 'timeline repeats an input combination' };
    }
    seen.add(combo);
    outputs.forEach((n, oi) => {
      if (t.outputs[n][s]) tables[oi] |= 1 << combo;
    });
  }
  if (seen.size !== rows) {
    return { k, inputs, outputs, targets: null, why: 'timeline does not cover every combination' };
  }
  return { k, inputs, outputs, targets: tables };
}

export interface PersonaResult {
  persona: string;
  solved: boolean;
  best: { parts: number; depth: number } | null;
  frontier: { parts: number; depth: number }[];
  /** false when the node budget ran out; a NONE result then proves nothing */
  exhaustive: boolean;
  states: number;
}

export interface LevelAnalysis {
  id: string;
  title: string;
  chapter: number;
  targets: LevelTargets;
  par: Score;
  results: PersonaResult[];
  /** the optimiser's non-dominated set; one entry means no trade-off exists here */
  frontierSize: number;
  /** components the reference spends above the true optimum — headroom to improve */
  headroom: number | null;
  /**
   * Components the level's newer tools save over inverters alone.
   * Zero means the level does not actually reward what it teaches.
   */
  toolSaving: number | null;
  /** no solution within the part budget — not a proof of impossibility */
  beyondBudget: boolean;
  witness: Solution | null;
}

const CACHE = new Map<string, LevelAnalysis>();

export function analyseLevel(level: Level): LevelAnalysis {
  const hit = CACHE.get(level.id);
  if (hit) return hit;

  const targets = levelTargets(level);
  const par = parFor(level, LIBRARY);
  const results: PersonaResult[] = [];
  let witness: Solution | null = null;

  if (targets.targets) {
    const { maxParts, nodeBudget } = budgetFor(targets.k);
    for (const p of PERSONAS) {
      const r = synthesise({
        k: targets.k,
        targets: targets.targets,
        kinds: p.kinds,
        maxParts,
        nodeBudget,
      });
      const best = r.frontier[0] ?? null;
      results.push({
        persona: p.id,
        solved: !!best,
        best: best ? { parts: best.parts, depth: best.depth } : null,
        frontier: r.frontier.map((s) => ({ parts: s.parts, depth: s.depth })),
        exhaustive: r.exhaustive,
        states: r.states,
      });
      if (p.id === 'optimiser' && best) witness = best;
    }
  }

  const opt = results.find((r) => r.persona === 'optimiser');
  const wireOnly = results.find((r) => r.persona === 'wire-only');

  const analysis: LevelAnalysis = {
    id: level.id,
    title: level.title,
    chapter: level.chapter,
    targets,
    par,
    results,
    frontierSize: opt?.frontier.length ?? 0,
    headroom: opt?.best ? par.components - opt.best.parts : null,
    toolSaving:
      opt?.best && wireOnly?.best ? wireOnly.best.parts - opt.best.parts : opt?.best ? null : null,
    beyondBudget: !!targets.targets && !opt?.solved,
    witness,
  };
  CACHE.set(level.id, analysis);
  return analysis;
}

export function analyseAll(levels: Level[]): LevelAnalysis[] {
  return levels.map(analyseLevel);
}
