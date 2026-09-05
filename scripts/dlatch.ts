/** How expensive is a D latch, really? The one chapter-4 question still open. */
import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, synthesiseSeq } from '../src/model/seq';

const spec: SeqSpec = {
  k: 2, // d, en
  inputs: [
    [false, true],
    [true, true],
    [true, false],
    [false, false],
    [false, true],
    [true, false],
    [true, true],
    [false, false],
  ],
  outputs: [[false, true, true, true, false, false, true, true]],
};

const runs: { label: string; kinds: PartKind[]; maxParts: number }[] = [
  { label: 'NOT+OR', kinds: ['not', 'or'], maxParts: 6 },
  { label: 'everything', kinds: ['not', 'buf', 'or'], maxParts: 6 },
];

for (const r of runs) {
  const t0 = Date.now();
  const res = synthesiseSeq({ spec, kinds: r.kinds, maxParts: r.maxParts, nodeBudget: 300_000_000 });
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  if (res.frontier.length === 0) {
    console.log(
      `${r.label}: NONE at <=${r.maxParts} parts  ${res.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${res.states} states  ${ms}s`,
    );
  } else {
    console.log(
      `${r.label}: ${res.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ')}  ${res.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${res.states} states  ${ms}s`,
    );
    for (const s of res.frontier) console.log(`    ${describeSeq(s.circuit, ['d', 'en'], ['q'])}`);
  }
}
