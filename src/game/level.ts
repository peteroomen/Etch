/**
 * Levels, and the verification that proves them.
 *
 * A level's test is a TIMELINE, not a bag of independent vectors: every signal
 * has a value at every step, and verification plots expected against actual so
 * the failure is visible as a divergence rather than reported as a count. That
 * is the Shenzhen I/O reading of "did it work", and it is the same structure
 * whether the circuit is combinational or has state.
 */

import { Dir, E, Kind } from '../sim/kinds';
import { idx } from '../sim/grid';
import { linkAllPins } from '../sim/draw';
import { BlueprintLibrary } from '../sim/blueprint';
import {
  World,
  componentCount,
  createWorld,
  placeComponent,
  readOutput,
  rebuild,
  reset,
  setInput,
  settle,
  tick,
} from '../sim/world';

export interface PinSpec {
  name: string;
  x: number;
  y: number;
  /** which way the pin faces; a left-edge input and a right-edge output are both E */
  rot?: Dir;
}

export type Advance = { mode: 'settle'; cap?: number } | { mode: 'ticks'; ticks: number };

export interface Timeline {
  steps: number;
  /** input pin name -> its value at each step */
  inputs: Record<string, boolean[]>;
  /** output pin name -> required value at each step; null means don't care */
  outputs: Record<string, (boolean | null)[]>;
  advance?: Advance;
}

export interface Score {
  components: number;
  ticks: number;
  area: number;
}

export interface Level {
  id: string;
  chapter: number;
  title: string;
  /** one line, shown under the title */
  teaches: string;
  /** datasheet body, one string per paragraph */
  brief: string[];
  grid: { w: number; h: number };
  inputs: PinSpec[];
  outputs: PinSpec[];
  /** tool and component ids the player may use */
  palette: string[];
  /** blueprint id granted on first solve */
  unlocks?: string;
  timeline: Timeline;
  /** builds a working solution; the harness derives par from it and never ships it */
  reference: (w: World) => void;
  /** filled in by the harness at build time */
  par?: Score;
}

// ---------------------------------------------------------------- world setup

/** A world with the level's pins placed and locked, ready for the player. */
export function createLevelWorld(level: Level, library: BlueprintLibrary): World {
  const w = createWorld(level.grid.w, level.grid.h, library);
  for (const p of level.inputs) {
    placeComponent(w, Kind.Source, p.x, p.y, p.rot ?? E, p.name);
    w.grid.locked[idx(w.grid, p.x, p.y)] = 1;
  }
  for (const p of level.outputs) {
    placeComponent(w, Kind.Sink, p.x, p.y, p.rot ?? E, p.name);
    w.grid.locked[idx(w.grid, p.x, p.y)] = 1;
  }
  rebuild(w);
  return w;
}

export function inputNames(level: Level): string[] {
  return level.inputs.map((p) => p.name);
}
export function outputNames(level: Level): string[] {
  return level.outputs.map((p) => p.name);
}

// ---------------------------------------------------------------- verification

export interface StepResult {
  step: number;
  inputs: Record<string, boolean>;
  expected: Record<string, boolean | null>;
  actual: Record<string, boolean>;
  /** propagation depth this step, measured from the previous stable state */
  ticks: number;
  settled: boolean;
  ok: boolean;
}

export interface Verification {
  steps: StepResult[];
  passed: boolean;
  /** index of the first step that diverged, or null */
  firstFailure: number | null;
  /** set when a step never stopped changing */
  oscillates: boolean;
  score: Score;
}

/** Cells the player authored. Locked pins are the level's, not theirs. */
export function areaUsed(world: World): number {
  const g = world.grid;
  let n = 0;
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] !== 0 && !g.locked[i]) n++;
  }
  return n;
}

/**
 * Run a level's timeline against a board.
 *
 * The board is settled once before step 0 so that depth is measured from a
 * stable state — otherwise every level would bill the player for the power-on
 * transient instead of for their logic.
 */
export function runTimeline(world: World, level: Level): Verification {
  const t = level.timeline;
  const ins = Object.keys(t.inputs);
  const outs = Object.keys(t.outputs);

  linkAllPins(world);
  rebuild(world);
  reset(world);
  for (const n of ins) setInput(world, n, !!t.inputs[n][0]);
  settle(world, 256);

  const steps: StepResult[] = [];
  let firstFailure: number | null = null;
  let oscillates = false;
  let worst = 0;

  for (let s = 0; s < t.steps; s++) {
    const stepInputs: Record<string, boolean> = {};
    for (const n of ins) {
      const v = !!t.inputs[n][s];
      stepInputs[n] = v;
      setInput(world, n, v);
    }

    let ticks = 0;
    let settled = true;
    if (!t.advance || t.advance.mode === 'settle') {
      const res = settle(world, t.advance?.cap ?? 256);
      ticks = res.ticks;
      settled = res.settled;
    } else {
      for (let i = 0; i < t.advance.ticks; i++) tick(world);
      ticks = t.advance.ticks;
    }

    const actual: Record<string, boolean> = {};
    const expected: Record<string, boolean | null> = {};
    let ok = settled;
    for (const n of outs) {
      const got = readOutput(world, n);
      const want = t.outputs[n][s] ?? null;
      actual[n] = got;
      expected[n] = want;
      if (want !== null && want !== got) ok = false;
    }

    if (!settled) oscillates = true;
    if (!ok && firstFailure === null) firstFailure = s;
    worst = Math.max(worst, ticks);
    steps.push({ step: s, inputs: stepInputs, expected, actual, ticks, settled, ok });
  }

  return {
    steps,
    passed: firstFailure === null,
    firstFailure,
    oscillates,
    score: { components: componentCount(world), ticks: worst, area: areaUsed(world) },
  };
}

/**
 * Build the reference solution and measure it.
 *
 * Par is always measured, never typed: a hand-written par is a hand-written
 * bug, and a level that ships unsolvable is the worst failure available here.
 */
export function verifyLevel(level: Level, library: BlueprintLibrary): Verification {
  const w = createLevelWorld(level, library);
  level.reference(w);
  return runTimeline(w, level);
}

/** True when a score beats par on at least one axis without losing on another. */
export function beatsPar(score: Score, par: Score): boolean {
  const better =
    score.components < par.components || score.ticks < par.ticks || score.area < par.area;
  const worse =
    score.components > par.components || score.ticks > par.ticks || score.area > par.area;
  return better && !worse;
}

// ---------------------------------------------------------------- timeline helpers

/** Every combination of n inputs, in counting order — the usual truth-table sweep. */
export function sweep(n: number): boolean[][] {
  const rows: boolean[][] = [];
  for (let i = 0; i < 1 << n; i++) {
    const row: boolean[] = [];
    for (let b = 0; b < n; b++) row.push((i & (1 << b)) !== 0);
    rows.push(row);
  }
  return rows;
}

/**
 * A timeline from a truth table: one step per input combination.
 *
 * `fn` receives the input bits and returns the required output bits.
 */
export function truthTimeline(
  inNames: string[],
  outNames: string[],
  fn: (bits: boolean[]) => boolean[],
): Timeline {
  const rows = sweep(inNames.length);
  const inputs: Record<string, boolean[]> = {};
  const outputs: Record<string, (boolean | null)[]> = {};
  inNames.forEach((n, i) => (inputs[n] = rows.map((r) => r[i])));
  outNames.forEach((n, i) => (outputs[n] = rows.map((r) => fn(r)[i])));
  return { steps: rows.length, inputs, outputs };
}

/** A timeline written out step by step, for anything with state. */
export function stepTimeline(
  inNames: string[],
  outNames: string[],
  rows: { in: boolean[]; out: (boolean | null)[] }[],
): Timeline {
  const inputs: Record<string, boolean[]> = {};
  const outputs: Record<string, (boolean | null)[]> = {};
  inNames.forEach((n, i) => (inputs[n] = rows.map((r) => r.in[i])));
  outNames.forEach((n, i) => (outputs[n] = rows.map((r) => r.out[i] ?? null)));
  return { steps: rows.length, inputs, outputs };
}

// ---------------------------------------------------------------- par

const PAR_CACHE = new Map<string, Score>();

/**
 * A level's par, measured by playing its reference solution.
 *
 * Memoised because the menu asks for every level's par on every render, and
 * the answer cannot change at runtime.
 */
export function parFor(level: Level, library: BlueprintLibrary): Score {
  const hit = PAR_CACHE.get(level.id);
  if (hit) return hit;
  const score = verifyLevel(level, library).score;
  PAR_CACHE.set(level.id, score);
  return score;
}
