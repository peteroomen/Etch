/**
 * Does fanning out across cores actually pay, and does it give the same answer?
 *
 * Kept as a script rather than a test because it spawns processes: a unit suite
 * that shells out four copies of Node is a unit suite nobody runs.
 */
import { SeqSpec, synthesiseSeq } from '../src/model/seq';
import { synthesiseSeqParallel } from '../src/model/parallel';

const spec: SeqSpec = {
  k: 3,
  inputs: [
    [false, false, true], [false, false, false], [true, false, false], [false, false, false],
    [false, true, false], [false, false, false], [true, true, false], [false, false, false],
    [false, false, true], [false, false, false], [true, true, false], [false, false, false],
  ],
  outputs: [[false, false, false, false, false, false, true, true, false, false, true, true]],
};
const opts = { spec, kinds: ['not'] as const, maxParts: 6, nodeBudget: 30_000_000 };

const t0 = Date.now();
const serial = synthesiseSeq({ ...opts, kinds: ['not'] });
const serialMs = Date.now() - t0;
console.log(`serial:   ${serial.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ')}  ${(serialMs / 1000).toFixed(1)}s  ${serial.states} states`);

const t1 = Date.now();
const par = await synthesiseSeqParallel({ ...opts, kinds: ['not'] });
const parMs = Date.now() - t1;
console.log(`parallel: ${par.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ')}  ${(parMs / 1000).toFixed(1)}s  ${par.states} states`);
const agree =
  JSON.stringify(serial.frontier.map((s) => [s.parts, s.depth])) ===
  JSON.stringify(par.frontier.map((s) => [s.parts, s.depth]));
console.log(`speedup:  ${(serialMs / parMs).toFixed(2)}x   agree=${agree}`);
if (!agree) {
  console.error('PARALLEL AND SERIAL DISAGREE — the slicing is wrong');
  process.exitCode = 1;
}
