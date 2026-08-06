/**
 * Why the master-slave will not settle, and what to demand instead.
 *
 * The 6-part D latch holds its value in a cross-coupled pair: n3 = NOT(n4),
 * n4 = NOT(n3) once EN is low. That pair is stable from either asymmetric
 * state and OSCILLATES from the symmetric one — and power-on is symmetric,
 * every net at zero.
 *
 * Standalone it never showed, because the test opened with EN high and the BUF
 * broke the tie. In a master-slave the two enables are complements, so one
 * latch is ALWAYS disabled at t=0 and powers on into the symmetric state.
 *
 * The fix is to make the spec demand what composition needs: open with the
 * latch DISABLED, so any candidate that cannot power on gets rejected by the
 * search instead of passing and failing later.
 */
import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, simulate, synthesiseSeq } from '../src/model/seq';

/** The old spec: opens with EN high, which quietly initialises the latch. */
const enabledFirst: SeqSpec = {
  k: 2,
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

/** The honest spec: opens DISABLED, so the circuit must power on by itself. */
const heldFirst: SeqSpec = {
  k: 2,
  inputs: [
    [false, false], // powered on, door shut: must already be defined
    [true, false], // d rises behind a shut door: still zero
    [true, true], // door opens, follows
    [true, false], // shut, holds
    [false, false], // d falls behind the door: holds
    [false, true], // opens, follows down
    [true, false], // rises behind the door: holds low
    [true, true], // opens, follows up
  ],
  outputs: [[false, false, true, true, true, false, false, true]],
};

const vocab: [string, PartKind[]][] = [
  ['NOT only', ['not']],
  ['NOT+BUF', ['not', 'buf']],
  ['NOT+OR', ['not', 'or']],
];

console.log('D latch that must power on into a defined state, with no help:');
for (const [label, kinds] of vocab) {
  const t0 = Date.now();
  const r = synthesiseSeq({ spec: heldFirst, kinds, maxParts: 7, nodeBudget: 120_000_000 });
  console.log(
    `  ${label.padEnd(10)} ${r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || 'none at <=7'}` +
      `  ${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${r.states} states  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  if (r.frontier[0]) console.log(`      ${describeSeq(r.frontier[0].circuit, ['d', 'en'], ['q'])}`);
}

// And confirm the old winner really does fail the honest spec.
const old = {
  k: 2,
  nets: 5,
  srcNet: [0, 1],
  parts: [
    { kind: 'not' as PartKind, ins: [0], out: 2 },
    { kind: 'not' as PartKind, ins: [1], out: 2 },
    { kind: 'not' as PartKind, ins: [2], out: 3 },
    { kind: 'not' as PartKind, ins: [4], out: 3 },
    { kind: 'not' as PartKind, ins: [3], out: 4 },
    { kind: 'buf' as PartKind, ins: [1], out: 4 },
  ],
  outputs: [3],
};
console.log(
  `\nthe 6-part latch against the honest spec: settled=${simulate(old, heldFirst).settled}` +
    `   against the old one: settled=${simulate(old, enabledFirst).settled}`,
);
