/**
 * Is there a level between the SR latch (2 parts) and the D latch?
 *
 * "Enable" gates only the SET side: S sets Q but only while EN is high, and R
 * resets it directly. That should cost the latch plus one AND rather than the
 * latch plus two, and if it does it is the missing rung of the chapter.
 */
import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, synthesiseSeq } from '../src/model/seq';

const spec: SeqSpec = {
  k: 3, // s, en, r
  inputs: [
    [false, false, true], // init: reset asserted
    [false, false, false],
    [true, false, false], // S alone must NOT set — the door is shut
    [false, false, false],
    [false, true, false], // EN alone must NOT set either, or S is decorative
    [false, false, false],
    [true, true, false], // S with EN sets
    [false, false, false], // and it holds
    [false, false, true], // R resets regardless of EN
    [false, false, false],
    [true, true, false],
    [false, false, false],
  ],
  outputs: [
    [false, false, false, false, false, false, true, true, false, false, true, true],
  ],
};

const runs: { label: string; kinds: PartKind[]; maxParts: number }[] = [
  { label: 'NOT only', kinds: ['not'], maxParts: 6 },
  { label: 'NOT+BUF', kinds: ['not', 'buf'], maxParts: 5 },
  { label: 'NOT+OR', kinds: ['not', 'or'], maxParts: 5 },
];

for (const r of runs) {
  const t0 = Date.now();
  const res = synthesiseSeq({ spec, kinds: r.kinds, maxParts: r.maxParts, nodeBudget: 200_000_000 });
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const head = res.frontier.length
    ? res.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ')
    : `NONE at <=${r.maxParts} parts`;
  console.log(
    `${r.label}: ${head}  ${res.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${res.states} states  ${ms}s`,
  );
  for (const s of res.frontier) {
    console.log(`    ${describeSeq(s.circuit, ['s', 'en', 'r'], ['q'])}`);
  }
}
