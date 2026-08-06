/** "Enable" — a gated SET, the rung between the bare latch and the D latch. */
import { SeqSpec, describeSeq, synthesiseSeq } from '../src/model/seq';

const spec: SeqSpec = {
  k: 3, // s, en, r
  inputs: [
    [false, false, true], // reset first, so the latch starts defined
    [false, false, false],
    [true, false, false], // S alone must NOT set — the door is shut
    [false, false, false],
    [false, true, false], // EN alone must not either, or S is decorative
    [false, false, false],
    [true, true, false], // both: sets
    [false, false, false], // and holds
    [false, false, true], // R resets whatever the door is doing
    [false, false, false],
    [true, true, false],
    [false, false, false],
  ],
  outputs: [[false, false, false, false, false, false, true, true, false, false, true, true]],
};

const t0 = Date.now();
const r = synthesiseSeq({ spec, kinds: ['not'], maxParts: 6, nodeBudget: 30_000_000 });
console.log(
  `NOT only: ${r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || 'none'}  ` +
    `${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
for (const s of r.frontier) console.log(`  ${describeSeq(s.circuit, ['s', 'en', 'r'], ['q'])}`);
