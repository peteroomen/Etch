/**
 * The real requirement is not "powers on to zero" — no real flip-flop does
 * that. It is "powers on to something DEFINED, and the clock flushes it".
 *
 * So: step 0 is a don't-care, and the circuit has to be right from step 1.
 */
import { Blueprint } from '../src/sim/blueprint';
import { E, Kind, W } from '../src/sim/kinds';
import { LIBRARY } from '../src/game/blueprints';
import { compileMacro } from '../src/model/macro';
import { SeqCircuit, SeqSpec, UpdateMode, simulate } from '../src/model/seq';

const binv = (f: number, t: number) => ({ kind: Kind.Inverter, inNets: [f], outNet: t });
const bbuf = (f: number, t: number) => ({ kind: Kind.Delay, inNets: [f], outNet: t });

const dlatch: Blueprint = {
  id: 'dlatch', label: 'DL', name: 'D latch', w: 2, h: 3, nets: 5,
  pins: [
    { name: 'd', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'en', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 0, dir: E, role: 'out', net: 3 },
  ],
  parts: [binv(0, 2), binv(1, 2), binv(2, 3), binv(4, 3), binv(3, 4), bbuf(1, 4)],
};
const macro = compileMacro(dlatch, LIBRARY);
const macros = new Map([['dlatch', macro]]);

/** clk high for two steps at a time, so a transparent latch fails steps 3 and 6 */
const spec: SeqSpec = {
  k: 2,
  inputs: [
    [false, false], [false, false],   // two settling steps, value not asserted
    [true, true], [false, true],      // edge samples 1; clock still high, d falls: hold
    [false, false], [false, true],    // edge samples 0
    [true, true], [true, false], [true, true],
  ],
  outputs: [[null, null, true, true, true, false, false, false, true]],
};

const masterSlave: SeqCircuit = {
  k: 2, nets: 5, srcNet: [0, 1],
  parts: [{ kind: 'not', ins: [1], out: 2 }],
  placements: [
    { macro: 'dlatch', hosts: [0, 2, 3] },
    { macro: 'dlatch', hosts: [3, 1, 4] },
  ],
  outputs: [4],
};

for (const mode of ['simultaneous', 'ordered', 'seeded'] as UpdateMode[]) {
  const s = simulate(masterSlave, spec, macros, mode);
  const want = spec.outputs[0];
  const got = s.traces[4];
  const ok = s.settled && want.every((v, i) => v === null || v === got[i]);
  console.log(
    `${mode.padEnd(13)} settled=${String(s.settled).padEnd(5)} ticks=${String(s.worst).padEnd(3)} ` +
      `correct=${ok}   got ${got?.map(Number).join('') ?? '(never settled)'}`,
  );
}
console.log(`want                                            ${spec.outputs[0].map((v) => (v === null ? '-' : +v)).join('')}`);
