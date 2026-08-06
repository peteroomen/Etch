/**
 * The decisive test: does the clearable D latch compose into a flip-flop?
 *
 * The 6-part latch did not — one of a master-slave's two latches is always
 * disabled at power-on, and a disabled cross-coupled pair sits in the symmetric
 * state and rings forever. If the clearable one composes, chapter 4 is buildable
 * as designed. If it does not, the substrate has to change.
 */
import { Blueprint } from '../src/sim/blueprint';
import { E, Kind, W } from '../src/sim/kinds';
import { LIBRARY } from '../src/game/blueprints';
import { compileMacro } from '../src/model/macro';
import { SeqSpec, simulate } from '../src/model/seq';

const inv = (from: number, to: number) => ({ kind: Kind.Inverter, inNets: [from], outNet: to });

/**
 *   n0 = d   | NOT(n1)
 *   n1 = en  | clr          <- en and clr are the SAME node, merged for free
 *   n2 = NOT(n0) | NOT(n1)
 *   n3 = NOT(n0) | NOT(n4)
 *   n4 = NOT(n2) | NOT(n3)  <- q
 */
const dlatch: Blueprint = {
  id: 'dlatchc',
  label: 'DL',
  name: 'D latch with clear',
  w: 2,
  h: 4,
  nets: 5,
  pins: [
    { name: 'd', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'en', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'clr', dx: 0, dy: 3, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 0, dir: E, role: 'out', net: 4 },
  ],
  parts: [inv(1, 0), inv(0, 2), inv(1, 2), inv(0, 3), inv(4, 3), inv(2, 4), inv(3, 4)],
};
const macro = compileMacro(dlatch, LIBRARY);
const macros = new Map([[macro.id, macro]]);
console.log(`tile: ${macro.cost} billed components\n`);

/** d, clk, clr. Steps 3 and 6 hold the clock HIGH while d moves. */
const spec: SeqSpec = {
  k: 3,
  inputs: [
    [false, false, true], // power-on reset, clock low
    [false, false, false],
    [true, true, false], // rising edge samples d=1
    [false, true, false], // clock STILL high, d falls — must hold
    [false, false, false],
    [false, true, false], // rising edge samples d=0
    [true, true, false], // still high, d rises — must hold
    [true, false, false],
    [true, true, false], // rising edge samples d=1
  ],
  outputs: [[false, false, true, true, true, false, false, false, true]],
};

/** master enabled while clk is LOW, slave while it is HIGH */
const masterSlave = {
  k: 3,
  nets: 6, // 0=d 1=clk 2=clr 3=NOT(clk) 4=master q 5=q
  srcNet: [0, 1, 2],
  parts: [{ kind: 'not' as const, ins: [1], out: 3 }],
  placements: [
    { macro: 'dlatchc', hosts: [0, 3, 2, 4] },
    { macro: 'dlatchc', hosts: [4, 1, 2, 5] },
  ],
  outputs: [5],
};

const sim = simulate(masterSlave, spec, macros);
const want = spec.outputs[0];
const got = sim.traces[5];
console.log('master-slave from the clearable latch:');
console.log(
  `  settled=${sim.settled}  billed=${1 + macro.cost * 2}  ticks=${sim.worst}  ` +
    `correct=${sim.settled && want.every((v, i) => v === null || v === got[i])}`,
);
console.log(`  wanted ${want.map((v) => (v === null ? '-' : +v)).join('')}   got ${got?.map(Number).join('') ?? '(never settled)'}`);

// a single latch must NOT pass, or the spec is not testing edge-triggering
const single = {
  k: 3,
  nets: 4,
  srcNet: [0, 1, 2],
  parts: [],
  placements: [{ macro: 'dlatchc', hosts: [0, 1, 2, 3] }],
  outputs: [3],
};
const s2 = simulate(single, spec, macros);
const g2 = s2.traces[3];
console.log(
  `\n  one latch alone: settled=${s2.settled} correct=` +
    `${s2.settled && want.every((v, i) => v === null || v === g2[i])}  (must be false)`,
);
