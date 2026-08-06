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
 * The textbook (a∨b) ∧ ¬(a∧b) is buildable too, but only with an OR GATE for
 * the a∨b: a gate READS its operands where a merge consumes them, and the NAND
 * half still needs both. Measured, that route costs six components and THREE
 * ticks. Written with a merge instead of a gate it cannot be transcribed at all,
 * which is why chapter 1 cannot express it.
 *
 * This form merges only fresh driven nets — an inverter output with a buffered
 * copy — so the inputs survive and the depth stays at two. Same size as the
 * textbook route, one tick faster.
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

/**
 * SR latch — two inverters, each holding the other down.
 *
 * The S pin and the Q pin are the SAME internal net, and so are R and q-bar.
 * That is not a shortcut, it is the gate: joining is destructive, so S is
 * merged into the feedback and Q is read off the S node exactly as an
 * open-collector latch behaves. It is why this costs two inverters here rather
 * than the textbook four.
 *
 * A symmetric release — S and R dropped together — has no simultaneous answer;
 * the tick rule breaks that tie by board order, so the latch always lands in a
 * real state. Which state is not something a level may depend on.
 */
const srlatch: Blueprint = {
  id: 'srlatch',
  label: 'SR',
  name: 'SR latch',
  w: 2,
  h: 3,
  nets: 2,
  pins: [
    { name: 's', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'r', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 0, dir: E, role: 'out', net: 0 },
    { name: 'qbar', dx: 1, dy: 2, dir: E, role: 'out', net: 1 },
  ],
  parts: [inv(1, 0), inv(0, 1)],
};

/**
 * D latch — transparent while EN is high, holds when it drops.
 *
 * Not the textbook build. The textbook needs two AND terms, `d ∧ en` to set and
 * `¬d ∧ en` to reset, which costs about nine inverters here once the copies of
 * d are paid for. This has no reset term at all: while EN is high the BUF holds
 * q-bar up, so NOT(q-bar) lets go and Q follows the set term alone; when EN
 * falls the BUF lets go and the cross-coupled pair keeps what it had.
 *
 * Six components, two ticks — found by the superoptimiser, not by hand.
 */
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
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 3 },
  ],
  parts: [inv(0, 2), inv(1, 2), inv(2, 3), inv(4, 3), inv(3, 4), buf(1, 4)],
};

/**
 * Edge-triggered D flip-flop — two latches on opposite phases of the clock.
 *
 * The master is transparent while the clock is LOW and the slave while it is
 * HIGH, so the two are never open at once and the output can only move on a
 * rising edge. That is the whole reason a clocked machine works: one
 * transparent latch in a feedback loop races itself; two out of phase do not.
 *
 * Thirteen components, five ticks.
 */
const dff: Blueprint = {
  id: 'dff',
  label: 'DFF',
  name: 'D flip-flop',
  w: 2,
  h: 3,
  nets: 5,
  pins: [
    { name: 'd', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'clk', dx: 0, dy: 2, dir: W, role: 'in', net: 1 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 4 },
  ],
  parts: [inv(1, 2)], // the clock, inverted, for the master
  subs: [
    { id: 'dlatch', netMap: [0, 2, 3] }, // master: d, open while the clock is low
    { id: 'dlatch', netMap: [3, 1, 4] }, // slave: master's q, open while it is high
  ],
};

/**
 * A 2-bit register: two flip-flops sharing one clock.
 *
 * There is no cleverness here and that is the lesson. Width costs exactly what
 * it looks like it costs — one flip-flop per bit — and the clock is FREE to
 * widen, because reading a net never consumes it. Every register in every
 * machine is this, repeated.
 */
const reg2: Blueprint = {
  id: 'reg2',
  label: 'REG2',
  name: '2-bit register',
  w: 2,
  h: 4,
  nets: 5,
  pins: [
    { name: 'd0', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'd1', dx: 0, dy: 1, dir: W, role: 'in', net: 1 },
    { name: 'clk', dx: 0, dy: 3, dir: W, role: 'in', net: 2 },
    { name: 'q0', dx: 1, dy: 0, dir: E, role: 'out', net: 3 },
    { name: 'q1', dx: 1, dy: 1, dir: E, role: 'out', net: 4 },
  ],
  parts: [],
  subs: [
    { id: 'dff', netMap: [0, 2, 3] },
    { id: 'dff', netMap: [1, 2, 4] },
  ],
};

/**
 * A register that only takes a new value when it is told to.
 *
 * The front of it is a two-way switch: feed the flip-flop the new bit while WE
 * is high, and its own output while WE is low, so an unwanted clock edge just
 * writes back what was already there. That is how a real register file works —
 * the clock reaches every register, and the enable decides which one moves.
 *
 * The two arms cost three components each, and the OR that joins them costs
 * nothing: both are fresh inverter outputs, so merging them is free.
 */
const regwe: Blueprint = {
  id: 'regwe',
  label: 'REGW',
  name: 'register with enable',
  w: 2,
  h: 4,
  nets: 7,
  pins: [
    { name: 'd', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'we', dx: 0, dy: 1, dir: W, role: 'in', net: 1 },
    { name: 'clk', dx: 0, dy: 3, dir: W, role: 'in', net: 2 },
    { name: 'q', dx: 1, dy: 1, dir: E, role: 'out', net: 3 },
  ],
  parts: [
    inv(0, 4), // ¬d  ┐
    inv(1, 4), // ¬we ┴─ net 4
    inv(4, 6), //        ¬net4 = d ∧ we      ┐
    inv(3, 5), // ¬q  ┐                      │
    buf(1, 5), //  we ┴─ net 5               │
    inv(5, 6), //        ¬net5 = q ∧ ¬we     ┴─ net 6, and the merge is the OR
  ],
  subs: [{ id: 'dff', netMap: [6, 2, 3] }],
};

/**
 * A 2-bit counter — two toggling flip-flops, the second clocked by the first.
 *
 * NOT(q0) does two jobs at once: it is the first flip-flop's own D, which is
 * what makes it toggle, and it is the second flip-flop's CLOCK. Reading a net
 * costs nothing, so the second job is free. The second stage therefore steps
 * every time q0 falls, which is every second clock — counting 0, 1, 2, 3.
 *
 * This is a RIPPLE counter: the stages move one after another rather than
 * together, and the deeper the chain the longer the wave takes to reach the
 * end. Twenty-eight components, eleven ticks for two bits.
 */
const count2: Blueprint = {
  id: 'count2',
  label: 'CNT2',
  name: '2-bit counter',
  w: 2,
  h: 4,
  nets: 5,
  pins: [
    { name: 'clk', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'q0', dx: 1, dy: 0, dir: E, role: 'out', net: 1 },
    { name: 'q1', dx: 1, dy: 2, dir: E, role: 'out', net: 2 },
  ],
  parts: [inv(1, 3), inv(2, 4)],
  subs: [
    { id: 'dff', netMap: [3, 0, 1] }, // toggles on every clock
    { id: 'dff', netMap: [4, 3, 2] }, // toggles when q0 falls
  ],
};

/**
 * 2-to-4 decoder: turns a two-bit number into four lines, exactly one high.
 *
 * Four NORs, and a NOR is the cheapest gate here — one inverter over a merge.
 * Each line needs its own copy of each input because merging consumes what it
 * merges, so the buffers are not waste, they are the price of the fan-out.
 *
 * Twelve components, two ticks. One-hot output is what makes the display cheap
 * later: a segment lit for three digits out of four is a single inverter.
 */
const dec24: Blueprint = {
  id: 'dec24',
  label: 'DEC',
  name: '2-to-4 decoder',
  w: 2,
  h: 5,
  nets: 10,
  pins: [
    { name: 'a', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'b', dx: 0, dy: 4, dir: W, role: 'in', net: 1 },
    { name: 'n0', dx: 1, dy: 0, dir: E, role: 'out', net: 2 },
    { name: 'n1', dx: 1, dy: 1, dir: E, role: 'out', net: 3 },
    { name: 'n2', dx: 1, dy: 2, dir: E, role: 'out', net: 4 },
    { name: 'n3', dx: 1, dy: 3, dir: E, role: 'out', net: 5 },
  ],
  parts: [
    buf(0, 6), buf(1, 6), inv(6, 2), // NOR(a, b)   = ¬a ∧ ¬b  -> 0
    inv(0, 7), buf(1, 7), inv(7, 3), // NOR(¬a, b)  =  a ∧ ¬b  -> 1
    buf(0, 8), inv(1, 8), inv(8, 4), // NOR(a, ¬b)  = ¬a ∧  b  -> 2
    inv(0, 9), inv(1, 9), inv(9, 5), // NOR(¬a, ¬b) =  a ∧  b  -> 3
  ],
};

/**
 * Four one-hot lines in, seven segments out — a digit, drawn in wire.
 *
 * This is a diode ROM, which is how the job was really done before anyone had
 * a chip to do it: one row per digit, one column per segment, and a diode
 * wherever the row lights the column. A buffer is this substrate's diode. It
 * makes a driven copy, which is exactly what stops the columns feeding back
 * into each other and lighting the wrong digit.
 *
 * The savings come from one-hot, and there are three of them worth naming.
 * A segment lit for every digit but one is a single inverter reading the odd
 * one out. Segments `a` and `d` are the same signal, so they share a net rather
 * than an inverter each. And `b`, which is lit for all four digits, is not four
 * copies merged — it is ¬n1 merged with n1, which is HIGH by construction and
 * costs two components instead of four.
 *
 * Nine components for a digit.
 */
const digit4: Blueprint = {
  id: 'digit4',
  label: 'DIG',
  name: 'segment matrix',
  w: 2,
  h: 7,
  nets: 10,
  pins: [
    { name: 'n0', dx: 0, dy: 0, dir: W, role: 'in', net: 0 },
    { name: 'n1', dx: 0, dy: 1, dir: W, role: 'in', net: 1 },
    { name: 'n2', dx: 0, dy: 2, dir: W, role: 'in', net: 2 },
    { name: 'n3', dx: 0, dy: 3, dir: W, role: 'in', net: 3 },
    { name: 'a', dx: 1, dy: 0, dir: E, role: 'out', net: 4 },
    { name: 'b', dx: 1, dy: 1, dir: E, role: 'out', net: 5 },
    { name: 'c', dx: 1, dy: 2, dir: E, role: 'out', net: 6 },
    { name: 'd', dx: 1, dy: 3, dir: E, role: 'out', net: 4 }, // the same line as a
    { name: 'e', dx: 1, dy: 4, dir: E, role: 'out', net: 7 },
    { name: 'f', dx: 1, dy: 5, dir: E, role: 'out', net: 8 },
    { name: 'g', dx: 1, dy: 6, dir: E, role: 'out', net: 9 },
  ],
  parts: [
    inv(1, 4), //             a and d: every digit but 1
    inv(1, 5), buf(1, 5), //  b: ¬n1 ∨ n1, which is every digit there is
    inv(2, 6), //             c: every digit but 2
    buf(0, 7), buf(2, 7), //  e: 0 and 2
    buf(2, 9), buf(3, 9), //  g: 2 and 3
    // f is lit for 0 alone. On a board that is a wire and costs nothing; a tile
    // cannot share one of its own input nets with the outside, so it pays a
    // buffer for the privilege of being a tile.
    buf(0, 8),
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
  srlatch,
  dlatch,
  dff,
  reg2,
  regwe,
  count2,
  dec24,
  digit4,
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
