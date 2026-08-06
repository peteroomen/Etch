/**
 * The same search, across every core.
 *
 * Source assignments are independent — no slice needs anything another slice
 * knows — so the search splits cleanly along them.
 *
 * The first attempt fanned out one part count at a time, so the caller could
 * still apply "stop one count past the first solution". That was SLOWER than
 * running serially: seven counts times four workers is twenty-eight process
 * starts, and starting Node with a TypeScript loader costs about a second
 * each. Now each worker is started once and explores its whole share, giving
 * up the early break to buy back twenty-four process starts.
 *
 * Child processes rather than worker threads because the search is TypeScript
 * and a worker has to load it the same way the scripts do. The startup cost is
 * fixed and real, so short searches should stay serial — see `worthParallel`.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { SeqOptions, SeqResult, SeqSolution } from './seq';

export interface ParallelOptions extends SeqOptions {
  /** how many processes; defaults to one per core, capped at 8 */
  workers?: number;
  /** print each part count as it completes */
  verbose?: boolean;
}

interface WireResult {
  found: { parts: number; depth: number; circuit: SeqSolution['circuit'] }[];
  exhaustive: boolean;
  states: number;
}

function runSlice(opts: SeqOptions, index: number, count: number): Promise<WireResult> {
  return new Promise((resolve, reject) => {
    // the binary directly, not through npx, which adds resolution time per spawn
    const child = spawn('node_modules/.bin/vite-node', ['scripts/searchWorker.ts'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`worker exited ${code}`));
      // the worker prints its result on the last line, so a stray log cannot
      // corrupt the payload
      const line = out.trim().split('\n').pop() ?? '';
      try {
        resolve(JSON.parse(line) as WireResult);
      } catch {
        reject(new Error(`worker gave unparseable output: ${line.slice(0, 200)}`));
      }
    });
    child.stdin.end(JSON.stringify({ ...opts, slice: { index, count } }));
  });
}

function frontierOf(all: SeqSolution[]): SeqSolution[] {
  return all
    .filter((s) => !all.some((o) => o !== s && o.parts <= s.parts && o.depth <= s.depth))
    .sort((a, b) => a.parts - b.parts || a.depth - b.depth);
}

/**
 * Roughly how many circuits a search will visit.
 *
 * Below a few million the process starts cost more than the parallelism saves,
 * so the caller should stay serial. This is a smell test, not a measurement.
 */
export function worthParallel(opts: SeqOptions): boolean {
  const nets = Math.min(opts.maxNets ?? 6, opts.spec.k + opts.maxParts);
  const catalogue = (opts.kinds.length + (opts.macros?.length ?? 0)) * nets * nets;
  return Math.pow(catalogue, Math.min(opts.maxParts, 4)) > 5e6;
}

export async function synthesiseSeqParallel(opts: ParallelOptions): Promise<SeqResult> {
  const workers = opts.workers ?? Math.min(8, Math.max(1, cpus().length));
  const slices = await Promise.all(
    Array.from({ length: workers }, (_, i) =>
      runSlice({ ...opts, workers: undefined } as SeqOptions, i, workers),
    ),
  );

  const best = new Map<string, SeqSolution>();
  let states = 0;
  let exhaustive = true;
  for (const r of slices) {
    states += r.states;
    if (!r.exhaustive) exhaustive = false;
    for (const f of r.found) {
      const key = `${f.parts}/${f.depth}`;
      if (!best.has(key)) best.set(key, f as SeqSolution);
    }
  }

  const all = [...best.values()];
  return {
    frontier: frontierOf(all),
    all: all
      .map((s) => ({ parts: s.parts, depth: s.depth }))
      .sort((a, b) => a.parts - b.parts || a.depth - b.depth),
    exhaustive,
    states,
  };
}
