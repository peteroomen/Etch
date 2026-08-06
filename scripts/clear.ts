/**
 * Power-on reset — the thing real hardware does and we had not modelled.
 *
 * Nothing drives LOW here, so at power-on every net sits at zero, which means
 * every inverter fires at once. That is a maximally symmetric state, and under
 * simultaneous update a cross-coupled pair cannot break the tie. Real latches
 * break it with mismatched delays; real SYSTEMS do not rely on that at all,
 * they assert a reset line at power-on.
 *
 * So: does a D latch with an explicit CLEAR exist, and is it cheap?
 */
import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, synthesiseSeq } from '../src/model/seq';

/** d, en, clr — and step 0 asserts clr, exactly as a power-on reset does. */
const spec: SeqSpec = {
  k: 3,
  inputs: [
    [false, false, true], // power-on reset
    [false, false, false], // door shut, holds zero
    [true, false, false], // d rises behind a shut door: still zero
    [true, true, false], // door opens, follows
    [true, false, false], // shut, holds one
    [false, false, false], // d falls behind the door: holds
    [false, true, false], // opens, follows down
    [true, false, false], // rises behind the door: holds low
    [true, true, false], // opens, follows up
    [false, false, true], // clear wins regardless
  ],
  outputs: [[false, false, false, true, true, true, false, false, true, false]],
};

const vocab: [string, PartKind[], number][] = [
  ['NOT only', ['not'], 7],
  ['NOT+BUF', ['not', 'buf'], 6],
  ['NOT+OR', ['not', 'or'], 6],
];

for (const [label, kinds, maxParts] of vocab) {
  const t0 = Date.now();
  const r = synthesiseSeq({ spec, kinds, maxParts, maxNets: 6, nodeBudget: 80_000_000 });
  console.log(
    `${label.padEnd(10)} ${r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || `none at <=${maxParts}`}` +
      `  ${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${r.states} states  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  for (const s of r.frontier) console.log(`    ${describeSeq(s.circuit, ['d', 'en', 'clr'], ['q'])}`);
}
