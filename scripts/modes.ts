/**
 * Ordered update, measured against the models.
 *
 * Two questions, and they pull in opposite directions:
 *   1. does it fix latches?           (the blocker)
 *   2. what does it do to the ticks?  (the metric the whole game scores on)
 */
import { Blueprint } from '../src/sim/blueprint';
import { E, Kind, W } from '../src/sim/kinds';
import { LIBRARY } from '../src/game/blueprints';
import { compileMacro } from '../src/model/macro';
import { SeqCircuit, SeqSpec, UpdateMode, simulate } from '../src/model/seq';

const MODES: UpdateMode[] = ['simultaneous', 'ordered', 'seeded', 'tiebreak'];
/** blueprint parts */
const binv = (from: number, to: number) => ({ kind: Kind.Inverter, inNets: [from], outNet: to });
const bbuf = (from: number, to: number) => ({ kind: Kind.Delay, inNets: [from], outNet: to });
/** model parts */
const inv = (from: number, to: number) => ({ kind: 'not' as const, ins: [from], out: to });
const buf = (from: number, to: number) => ({ kind: 'buf' as const, ins: [from], out: to });

function row(label: string, cells: string[]) {
  console.log(`  ${label.padEnd(30)} ${cells.map((c) => c.padEnd(16)).join('')}`);
}

console.log('mode:'.padEnd(32) + MODES.map((m) => m.padEnd(16)).join(''));

// ---------------------------------------------------------------- 1. the ring
const ring: SeqCircuit = {
  k: 1,
  nets: 2,
  srcNet: [-1],
  parts: [
    { kind: 'not', ins: [1], out: 0 },
    { kind: 'not', ins: [0], out: 1 },
  ],
  outputs: [0],
};
row(
  'two-inverter ring, cold',
  MODES.map((m) => {
    const s = simulate(ring, { k: 1, inputs: [[false]], outputs: [[null]] }, undefined, m);
    return s.settled ? `settles ${s.worst}t` : 'OSCILLATES';
  }),
);

// ---------------------------------------------------------------- 2. depth
/**
 * A chain of four inverters laid out in evaluation order. Simultaneous update
 * bills four ticks — the real logic depth. Ordered update lets the whole chain
 * propagate inside one pass, which is the danger.
 */
const chain: SeqCircuit = {
  k: 1,
  nets: 5,
  srcNet: [0],
  parts: [inv(0, 1), inv(1, 2), inv(2, 3), inv(3, 4)],
  outputs: [4],
};
const chainSpec: SeqSpec = { k: 1, inputs: [[false], [true], [false]], outputs: [[null, null, null]] };
row(
  'four-inverter chain (depth 4)',
  MODES.map((m) => `${simulate(chain, chainSpec, undefined, m).worst} ticks`),
);

/** The same chain wired against the scan order — last part first. */
const reversed: SeqCircuit = {
  k: 1,
  nets: 5,
  srcNet: [0],
  parts: [inv(3, 4), inv(2, 3), inv(1, 2), inv(0, 1)],
  outputs: [4],
};
row(
  'same chain, reversed order',
  MODES.map((m) => `${simulate(reversed, chainSpec, undefined, m).worst} ticks`),
);

// ---------------------------------------------------------------- 3. latches
const dlatch: Blueprint = {
  id: 'dlatch',
  label: 'DL',
  name: 'D latch',
  w: 2,
  h: 3,
  nets: 5,
  pins: [
    { name: 'd', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'en', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 0, dir: E, role: 'out', net: 3 },
  ],
  parts: [binv(0, 2), binv(1, 2), binv(2, 3), binv(4, 3), binv(3, 4), bbuf(1, 4)],
};
const macro = compileMacro(dlatch, LIBRARY);
const macros = new Map([['dlatch', macro]]);

/** Opens with the door SHUT, so the latch must power on unaided. */
const heldFirst: SeqSpec = {
  k: 2,
  inputs: [
    [false, false],
    [true, false],
    [true, true],
    [true, false],
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ],
  outputs: [[false, false, true, true, true, false, false, true]],
};
const single: SeqCircuit = {
  k: 2,
  nets: 3,
  srcNet: [0, 1],
  parts: [],
  placements: [{ macro: 'dlatch', hosts: [0, 1, 2] }],
  outputs: [2],
};
row(
  'D latch, powers on unaided',
  MODES.map((m) => {
    const s = simulate(single, heldFirst, macros, m);
    const want = heldFirst.outputs[0];
    const got = s.traces[2];
    if (!s.settled) return 'OSCILLATES';
    return want.every((v, i) => v === null || v === got[i]) ? `correct ${s.worst}t` : 'wrong';
  }),
);

/** Master-slave: the composition that failed. */
const flipSpec: SeqSpec = {
  k: 2,
  inputs: [
    [false, false],
    [true, true],
    [false, true],
    [false, false],
    [false, true],
    [true, true],
    [true, false],
    [true, true],
  ],
  outputs: [[false, true, true, true, false, false, false, true]],
};
const masterSlave: SeqCircuit = {
  k: 2,
  nets: 5,
  srcNet: [0, 1],
  parts: [{ kind: 'not', ins: [1], out: 2 }],
  placements: [
    { macro: 'dlatch', hosts: [0, 2, 3] },
    { macro: 'dlatch', hosts: [3, 1, 4] },
  ],
  outputs: [4],
};
row(
  'master-slave flip-flop',
  MODES.map((m) => {
    const s = simulate(masterSlave, flipSpec, macros, m);
    const want = flipSpec.outputs[0];
    const got = s.traces[4];
    if (!s.settled) return 'OSCILLATES';
    return want.every((v, i) => v === null || v === got[i]) ? `correct ${s.worst}t` : `wrong ${s.worst}t`;
  }),
);

// ---------------------------------------------------------------- 4. the campaign
console.log('\nwhat it does to existing tick pars:');
const gates: [string, SeqCircuit][] = [
  [
    'NOR (depth 1)',
    { k: 2, nets: 2, srcNet: [0, 0], parts: [inv(0, 1)], outputs: [1] },
  ],
  [
    'NAND (depth 1)',
    { k: 2, nets: 3, srcNet: [0, 1], parts: [inv(0, 2), inv(1, 2)], outputs: [2] },
  ],
  [
    'AND (depth 2)',
    { k: 2, nets: 4, srcNet: [0, 1], parts: [inv(0, 2), inv(1, 2), inv(2, 3)], outputs: [3] },
  ],
  [
    'XOR (depth 2)',
    {
      k: 2,
      nets: 5,
      srcNet: [0, 1],
      parts: [inv(0, 2), buf(1, 2), inv(1, 3), buf(0, 3), inv(2, 4), inv(3, 4)],
      outputs: [4],
    },
  ],
];
const sweep: SeqSpec = {
  k: 2,
  inputs: [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ],
  outputs: [[null, null, null, null]],
};
for (const [label, c] of gates) {
  row(
    label,
    MODES.map((m) => `${simulate(c, sweep, undefined, m).worst} ticks`),
  );
}
