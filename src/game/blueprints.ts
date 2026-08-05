/**
 * The standard blueprint library — every component the player unlocks.
 *
 * Each one is exactly what the corresponding level asks them to build, so an
 * unlock is never more (or less) than the thing they proved they understood.
 * Costs and delays are consequences of the netlist, not numbers typed here.
 *
 * The substrate's rule shapes all of these: merging nets consumes them, so a
 * signal feeding two merges needs a BUF copy for each. Read the tables in
 * docs/decisions.md before changing any of them.
 */

import { Blueprint, BlueprintLibrary } from '../sim/blueprint';
import { E, Kind, W } from '../sim/kinds';

const inv = (from: number, to: number) => ({ kind: Kind.Inverter, inNets: [from], outNet: to });
const buf = (from: number, to: number) => ({ kind: Kind.Delay, inNets: [from], outNet: to });

/**
 * NOR — join the two inputs, then invert. One inverter, one tick: the cheapest
 * gate in this universe.
 *
 * Its two input pins are the SAME internal net, so placing a NOR genuinely
 * merges the two wires feeding it. That is not a quirk, it is the gate: a NOR
 * here consumes its inputs, and the board shows it by lighting them as one.
 */
const nor2: Blueprint = {
  id: 'nor2',
  label: 'NOR',
  name: 'NOR gate',
  w: 2,
  h: 3,
  nets: 2,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 2, dir: W, role: 'in', net: 0 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 1 },
  ],
  parts: [inv(0, 1)],
};

/**
 * NAND — invert both, then join the outputs. Two inverters, one tick.
 * Cheaper than AND, and non-destructive: a and b survive.
 */
const nand2: Blueprint = {
  id: 'nand2',
  label: 'NAND',
  name: 'NAND gate',
  w: 2,
  h: 3,
  nets: 3,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 2 },
  ],
  parts: [inv(0, 2), inv(1, 2)],
};

/** AND — NAND, then undo the inversion. De Morgan in three inverters, two ticks. */
const and2: Blueprint = {
  id: 'and2',
  label: 'AND',
  name: 'AND gate',
  w: 2,
  h: 3,
  nets: 4,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 3 },
  ],
  parts: [inv(0, 2), inv(1, 2), inv(2, 3)],
};

/**
 * XOR as (a ∧ ¬b) ∨ (¬a ∧ b).
 *
 * The textbook (a∨b) ∧ ¬(a∧b) cannot be built here: computing a∨b destroys the
 * a and b the NAND still needs. This form merges only fresh driven nets — an
 * inverter output with a buffered copy — so the inputs survive.
 *
 * Six components, two ticks.
 */
const xor2: Blueprint = {
  id: 'xor2',
  label: 'XOR',
  name: 'XOR gate',
  w: 2,
  h: 3,
  nets: 5,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 4 },
  ],
  parts: [
    inv(0, 2), // ¬a ─┐
    buf(1, 2), //  b ─┴─> net 2 = ¬a ∨ b
    inv(1, 3), // ¬b ─┐
    buf(0, 3), //  a ─┴─> net 3 = ¬b ∨ a
    inv(2, 4), // ¬(¬a ∨ b) = a ∧ ¬b ─┐
    inv(3, 4), // ¬(¬b ∨ a) = ¬a ∧ b ─┴─> out
  ],
};

/** Half adder: sum is XOR, carry is AND. Both read a and b, and reads are free. */
const halfadder: Blueprint = {
  id: 'halfadder',
  label: 'HA',
  name: 'half adder',
  w: 2,
  h: 4,
  nets: 4,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 3, dir: W, role: 'in', net: 1 },
    { name: 'sum', dx: 1, dy: 0, dir: E, role: 'out', net: 2 },
    { name: 'carry', dx: 1, dy: 3, dir: E, role: 'out', net: 3 },
  ],
  parts: [],
  subs: [
    { id: 'xor2', netMap: [0, 1, 2] },
    { id: 'and2', netMap: [0, 1, 3] },
  ],
};

/**
 * Full adder: two half adders, their carries joined.
 *
 * Joining the two carry outputs is legal because both are inverter outputs
 * inside their own gates — fresh driven nets, not the operands of anything.
 */
const fulladder: Blueprint = {
  id: 'fulladder',
  label: 'FA',
  name: 'full adder',
  w: 2,
  h: 5,
  nets: 6,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'cin', dx: 0, dy: 4, dir: W, role: 'in', net: 2 },
    { name: 'sum', dx: 1, dy: 0, dir: E, role: 'out', net: 4 },
    { name: 'cout', dx: 1, dy: 4, dir: E, role: 'out', net: 5 },
  ],
  parts: [],
  subs: [
    { id: 'halfadder', netMap: [0, 1, 3, 5] }, // a,b -> s1, carry
    { id: 'halfadder', netMap: [3, 2, 4, 5] }, // s1,cin -> sum, carry
  ],
};

/** Four full adders in a ripple chain. Carry latency grows with width — that is the lesson. */
const adder4: Blueprint = {
  id: 'adder4',
  label: 'ADD4',
  name: '4-bit adder',
  w: 3,
  h: 9,
  nets: 17,
  pins: [
    { name: 'a0', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'a1', dx: 0, dy: 1, dir: W, role: 'in', net: 1 },
    { name: 'a2', dx: 0, dy: 2, dir: W, role: 'in', net: 2 },
    { name: 'a3', dx: 0, dy: 3, dir: W, role: 'in', net: 3 },
    { name: 'b0', dx: 0, dy: 4, dir: W, role: 'in', net: 4 },
    { name: 'b1', dx: 0, dy: 5, dir: W, role: 'in', net: 5 },
    { name: 'b2', dx: 0, dy: 6, dir: W, role: 'in', net: 6 },
    { name: 'b3', dx: 0, dy: 7, dir: W, role: 'in', net: 7 },
    { name: 'cin', dx: 0, dy: 8, dir: W, role: 'in', net: 8 },
    { name: 's0', dx: 2, dy: 0, dir: E, role: 'out', net: 9 },
    { name: 's1', dx: 2, dy: 1, dir: E, role: 'out', net: 10 },
    { name: 's2', dx: 2, dy: 2, dir: E, role: 'out', net: 11 },
    { name: 's3', dx: 2, dy: 3, dir: E, role: 'out', net: 12 },
    { name: 'cout', dx: 2, dy: 4, dir: E, role: 'out', net: 13 },
  ],
  parts: [],
  subs: [
    { id: 'fulladder', netMap: [0, 4, 8, 9, 14] },
    { id: 'fulladder', netMap: [1, 5, 14, 10, 15] },
    { id: 'fulladder', netMap: [2, 6, 15, 11, 16] },
    { id: 'fulladder', netMap: [3, 7, 16, 12, 13] },
  ],
};

export const BLUEPRINTS: Blueprint[] = [
  nor2,
  nand2,
  and2,
  xor2,
  halfadder,
  fulladder,
  adder4,
];

export const LIBRARY: BlueprintLibrary = new Map(BLUEPRINTS.map((b) => [b.id, b]));

/**
 * Author-time sanity check.
 *
 * Catches the mistakes that would otherwise show up as a level that cannot be
 * solved: a pin pointing at an internal net that does not exist, a sub whose
 * netMap is the wrong length, a part wired to nothing.
 */
export function validateBlueprint(bp: Blueprint, library: BlueprintLibrary): string[] {
  const problems: string[] = [];
  const inRange = (n: number) => n >= 0 && n < bp.nets;

  bp.pins.forEach((p, i) => {
    if (!inRange(p.net)) problems.push(`pin ${i} (${p.name}) uses net ${p.net}, out of range`);
    if (p.dx < 0 || p.dy < 0 || p.dx >= bp.w || p.dy >= bp.h) {
      problems.push(`pin ${i} (${p.name}) sits outside the ${bp.w}x${bp.h} footprint`);
    }
  });

  bp.parts.forEach((part, i) => {
    part.inNets.forEach((n) => {
      if (!inRange(n)) problems.push(`part ${i} reads net ${n}, out of range`);
    });
    if (part.outNet >= 0 && !inRange(part.outNet)) {
      problems.push(`part ${i} drives net ${part.outNet}, out of range`);
    }
  });

  (bp.subs ?? []).forEach((sub, i) => {
    const child = library.get(sub.id);
    if (!child) {
      problems.push(`sub ${i} references missing blueprint "${sub.id}"`);
      return;
    }
    if (sub.netMap.length !== child.pins.length) {
      problems.push(
        `sub ${i} ("${sub.id}") maps ${sub.netMap.length} nets but the blueprint has ${child.pins.length} pins`,
      );
    }
    sub.netMap.forEach((n) => {
      if (!inRange(n)) problems.push(`sub ${i} ("${sub.id}") maps to net ${n}, out of range`);
    });
  });

  const driven = new Set<number>();
  bp.parts.forEach((p) => {
    if (p.outNet >= 0) driven.add(p.outNet);
  });
  (bp.subs ?? []).forEach((sub) => {
    const child = library.get(sub.id);
    child?.pins.forEach((pin, i) => {
      if (pin.role === 'out') driven.add(sub.netMap[i]);
    });
  });
  bp.pins.forEach((p) => {
    if (p.role === 'out' && !driven.has(p.net)) {
      problems.push(`output pin "${p.name}" is not driven by anything`);
    }
  });

  return problems;
}
