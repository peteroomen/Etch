/**
 * Is the textbook XOR really impossible here?
 *
 * The README, blueprints.ts and the level brief all say the same thing:
 * `(a∨b) ∧ ¬(a∧b)` cannot be transcribed, because computing a∨b destroys the a
 * and b the other half still needs.
 *
 * That reasoning assumes a∨b is made by MERGING. It is not the only way to make
 * one any more — the OR gate reads its operands instead of consuming them, and
 * the XOR level's palette has had it for a while. So the claim is worth
 * re-testing rather than re-repeating.
 */
import { SeqSpec, describeSeq, simulate, synthesiseSeq } from '../src/model/seq';
import { PartKind } from '../src/model/synth';

const xor: SeqSpec = {
  k: 2,
  inputs: [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ],
  outputs: [[false, true, true, false]],
};

console.log('--- what the search says the optimum is ---');
for (const [label, kinds] of [
  ['NOT only', ['not']],
  ['NOT+BUF', ['not', 'buf']],
  ['NOT+OR', ['not', 'or']],
  ['everything', ['not', 'buf', 'or']],
] as [string, PartKind[]][]) {
  const r = synthesiseSeq({ spec: xor, kinds, maxParts: 9, nodeBudget: 60_000_000 });
  console.log(
    `  ${label.padEnd(11)} ${r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || 'none'}` +
      `  ${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}`,
  );
  if (r.frontier[0]) console.log(`      ${describeSeq(r.frontier[0].circuit, ['a', 'b'], ['q'])}`);
}

/**
 * The textbook form, transcribed literally, using the OR GATE for a∨b so that
 * a and b survive:
 *
 *   n2 = OR(a, b)                       a ∨ b            1 part
 *   n3 = NOT(a) | NOT(b)                ¬(a ∧ b)         2 parts
 *   n4 = NOT(n2) | NOT(n3)              ¬(n2 ∧ n3)       2 parts
 *   n5 = NOT(n4)                        n2 ∧ n3          1 part
 */
console.log('\n--- the textbook form, transcribed with an OR gate ---');
const textbook = {
  k: 2,
  nets: 6,
  srcNet: [0, 1],
  parts: [
    { kind: 'or' as PartKind, ins: [0, 1], out: 2 },
    { kind: 'not' as PartKind, ins: [0], out: 3 },
    { kind: 'not' as PartKind, ins: [1], out: 3 },
    { kind: 'not' as PartKind, ins: [2], out: 4 },
    { kind: 'not' as PartKind, ins: [3], out: 4 },
    { kind: 'not' as PartKind, ins: [4], out: 5 },
  ],
  outputs: [5],
};
const sim = simulate(textbook, xor);
const want = xor.outputs[0];
const got = sim.traces[5];
console.log(`  ${describeSeq(textbook, ['a', 'b'], ['q'])}`);
console.log(
  `  settled=${sim.settled}  parts=${textbook.parts.length}  ticks=${sim.worst}  ` +
    `correct=${sim.settled && want.every((v, i) => v === got[i])}`,
);
console.log(`  wanted ${want.map(Number).join('')}, got ${got?.map(Number).join('') ?? '-'}`);

/** And the same thing with a BUF copy instead of an OR gate, for comparison. */
console.log('\n--- the textbook form, with BUF copies instead ---');
const withBuf = {
  k: 2,
  nets: 7,
  srcNet: [0, 1],
  parts: [
    { kind: 'buf' as PartKind, ins: [0], out: 2 }, // copy of a
    { kind: 'buf' as PartKind, ins: [1], out: 2 }, // merged with a copy of b -> a ∨ b
    { kind: 'not' as PartKind, ins: [0], out: 3 },
    { kind: 'not' as PartKind, ins: [1], out: 3 },
    { kind: 'not' as PartKind, ins: [2], out: 4 },
    { kind: 'not' as PartKind, ins: [3], out: 4 },
    { kind: 'not' as PartKind, ins: [4], out: 5 },
  ],
  outputs: [5],
};
const sim2 = simulate(withBuf, xor);
const got2 = sim2.traces[5];
console.log(`  ${describeSeq(withBuf, ['a', 'b'], ['q'])}`);
console.log(
  `  settled=${sim2.settled}  parts=${withBuf.parts.length}  ticks=${sim2.worst}  ` +
    `correct=${sim2.settled && want.every((v, i) => v === got2[i])}`,
);
