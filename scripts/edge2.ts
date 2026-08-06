/** Level 17, Edge — verify the reference and rule out cheap cheats. */
import { Blueprint } from '../src/sim/blueprint';
import { E, Kind, W } from '../src/sim/kinds';
import { LIBRARY } from '../src/game/blueprints';
import { compileMacro } from '../src/model/macro';
import { SeqSpec, simulate, synthesiseSeq } from '../src/model/seq';

const inv = (from: number, to: number) => ({ kind: Kind.Inverter, inNets: [from], outNet: to });
const buf = (from: number, to: number) => ({ kind: Kind.Delay, inNets: [from], outNet: to });

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
  parts: [inv(0, 2), inv(1, 2), inv(2, 3), inv(4, 3), inv(3, 4), buf(1, 4)],
};
const macro = compileMacro(dlatch, LIBRARY);
const macros = new Map([['dlatch', macro]]);

/** Steps 2 and 5 hold the clock HIGH while d changes — a transparent latch fails there. */
const spec: SeqSpec = {
  k: 2, // d, clk
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

const masterSlave = {
  k: 2,
  nets: 5,
  srcNet: [0, 1],
  parts: [{ kind: 'not' as const, ins: [1], out: 2 }],
  placements: [
    { macro: 'dlatch', hosts: [0, 2, 3] }, // master: d, enabled while clk is LOW
    { macro: 'dlatch', hosts: [3, 1, 4] }, // slave: master's q, enabled while clk is HIGH
  ],
  outputs: [4],
};

const sim = simulate(masterSlave, spec, macros);
const want = spec.outputs[0];
const got = sim.traces[4];
console.log('reference master-slave:');
console.log(
  `  settled=${sim.settled}  billed=${1 + macro.cost * 2}  ticks=${sim.worst}  ` +
    `correct=${sim.settled && want.every((v, i) => v === null || v === got[i])}`,
);
console.log(`  wanted ${want.map((v) => (v === null ? '-' : +v)).join('')}   got ${got?.map(Number).join('') ?? '-'}`);

console.log('\nno cheap degenerate answer below it:');
for (const budget of [6, 7, 8]) {
  const t0 = Date.now();
  const r = synthesiseSeq({
    spec,
    kinds: ['not', 'buf'],
    maxParts: budget,
    maxNets: 4,
    nodeBudget: 30_000_000,
    macros: [macro],
  });
  console.log(
    `  <=${budget} billed: ${r.frontier.length ? 'FOUND A CHEAT' : 'nothing'}` +
      `  (${r.exhaustive ? 'exhaustive' : 'truncated'}, ${r.states} states, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
