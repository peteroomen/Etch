/** Two loose ends the enumeration left open, settled directly. */
import { SeqSpec, simulate, synthesiseSeq } from '../src/model/seq';

const dSpec: SeqSpec = {
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

// OR(x,x) is a buffer, so the BUF answer should transplant into an OR palette
// at the same cost. The NOT+OR search truncated before reaching it; this checks
// the substitution directly rather than leaving the cell blank.
const asOr = simulate(
  {
    k: 2,
    nets: 5,
    srcNet: [0, 1],
    parts: [
      { kind: 'not', ins: [0], out: 2 },
      { kind: 'not', ins: [1], out: 2 },
      { kind: 'not', ins: [2], out: 3 },
      { kind: 'not', ins: [4], out: 3 },
      { kind: 'not', ins: [3], out: 4 },
      { kind: 'or', ins: [1, 1], out: 4 },
    ],
    outputs: [3],
  },
  dSpec,
);
const want = dSpec.outputs[0];
const got = asOr.traces[3];
console.log(
  `D latch with OR instead of BUF: settled=${asOr.settled} ticks=${asOr.worst} ` +
    `matches=${asOr.settled && want.every((v, i) => v === null || v === got[i])}`,
);

// Hold with inverters alone was only ruled out to four parts. Push it further.
const holdSpec: SeqSpec = {
  k: 1,
  inputs: [[false], [true], [false], [false], [true], [false]],
  outputs: [[false, true, true, true, true, true]],
};
for (const maxParts of [5, 6]) {
  const r = synthesiseSeq({ spec: holdSpec, kinds: ['not'], maxParts, nodeBudget: 200_000_000 });
  console.log(
    `Hold with NOT only, <=${maxParts} parts: ${r.frontier.length ? 'FOUND' : 'none'}  ` +
      `${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${r.states} states`,
  );
}
