/**
 * The campaign.
 *
 * Palette restriction per level is the difficulty curve, and solving a level
 * grants the thing it taught you to build. Every reference solution here is
 * run by the harness at build time, which is where par comes from — no par is
 * ever typed by hand.
 *
 * Chapter 2 is ordered by ascending cost in THIS substrate, which is inverted
 * from CMOS intuition: NOR is one inverter, NAND two, AND three. That ordering
 * is the chapter's lesson.
 */

import { N, S } from '../sim/kinds';
import { buf, inv, path, run } from '../sim/build';
import { placeBlueprint } from '../sim/world';
import { Level, stepTimeline, truthTimeline } from './level';

const WIRE = ['wire'];
const WIRE_X = ['wire', 'cross'];

/**
 * A hand-written timeline, with rows as digits.
 *
 * `stepTimeline` wants booleans; a wall of `true, false, false` is unreadable
 * and a wrong bit in it is invisible. Digits line up in columns, so a wrong one
 * looks wrong.
 */
function steps(
  ins: string[],
  outs: string[],
  rows: { in: number[]; out: (number | null)[] }[],
) {
  return stepTimeline(
    ins,
    outs,
    rows.map((r) => ({
      in: r.in.map(Boolean),
      out: r.out.map((v) => (v === null ? null : Boolean(v))),
    })),
  );
}

// ------------------------------------------------------------------ chapter 1

const continuity: Level = {
  id: 'continuity',
  chapter: 1,
  title: 'Continuity',
  teaches: 'A wire is a node, not a pipe.',
  brief: [
    'Connect IN to OUT.',
    'Wire joined into one run is a single node — the same signal everywhere along it, at the same instant.',
  ],
  grid: { w: 12, h: 7 },
  inputs: [{ name: 'a', x: 0, y: 3 }],
  outputs: [{ name: 'q', x: 11, y: 3 }],
  palette: WIRE,
  timeline: truthTimeline(['a'], ['q'], ([a]) => [a]),
  reference: (w) => run(w, 1, 3, 10, 3),
};

const invert: Level = {
  id: 'invert',
  chapter: 1,
  title: 'Invert',
  teaches: 'Components cost a tick. Wire does not.',
  brief: [
    'OUT must be the opposite of IN.',
    'The inverter drives its output HIGH while its input is LOW. When the input goes HIGH it lets go, and a wire nothing is holding falls LOW on its own.',
  ],
  grid: { w: 12, h: 7 },
  inputs: [{ name: 'a', x: 0, y: 3 }],
  outputs: [{ name: 'q', x: 11, y: 3 }],
  palette: [...WIRE, 'not'],
  timeline: truthTimeline(['a'], ['q'], ([a]) => [!a]),
  reference: (w) => {
    run(w, 1, 3, 5, 3);
    inv(w, 6, 3);
    run(w, 7, 3, 10, 3);
  },
};

const fanout: Level = {
  id: 'fanout',
  chapter: 1,
  title: 'Fan-out',
  teaches: 'Reading a net is free, and any number of readers may share one.',
  brief: [
    'All three outputs must follow IN.',
    'Reading a node is free. Attach as many things as you like — none of them changes it, and none of them costs you.',
  ],
  grid: { w: 12, h: 9 },
  inputs: [{ name: 'a', x: 0, y: 4 }],
  outputs: [
    { name: 'q1', x: 11, y: 1 },
    { name: 'q2', x: 11, y: 4 },
    { name: 'q3', x: 11, y: 7 },
  ],
  palette: WIRE,
  timeline: truthTimeline(['a'], ['q1', 'q2', 'q3'], ([a]) => [a, a, a]),
  reference: (w) => {
    path(w, [9, 1], [9, 7]); // spine first
    run(w, 1, 4, 9, 4); // taps it, promoting the middle to a junction
    run(w, 9, 1, 10, 1);
    run(w, 9, 4, 10, 4);
    run(w, 9, 7, 10, 7);
  },
};

const either: Level = {
  id: 'either',
  chapter: 1,
  title: 'Either',
  teaches: 'Joining two nets ORs them — and consumes them.',
  brief: [
    'OUT must be HIGH when either input is.',
    'There is no OR component and you do not need one. Drive one node from two places: it goes HIGH when either driver pulls it HIGH.',
    'It costs you something else. A and B are one node now, and nothing downstream can tell them apart again.',
  ],
  grid: { w: 12, h: 7 },
  inputs: [
    { name: 'a', x: 0, y: 2 },
    { name: 'b', x: 0, y: 4 },
  ],
  outputs: [{ name: 'q', x: 11, y: 3 }],
  palette: WIRE,
  timeline: truthTimeline(['a', 'b'], ['q'], ([a, b]) => [a || b]),
  reference: (w) => {
    path(w, [1, 2], [8, 2], [8, 4], [1, 4]);
    run(w, 8, 3, 10, 3);
  },
};

const crossing: Level = {
  id: 'crossing',
  chapter: 1,
  title: 'Crossing',
  teaches: 'Wires that touch do not join. Crossing is explicit.',
  brief: [
    'A must reach the lower output, B the upper. Their paths have to cross.',
    'Draw one run over another and you get a CROSSOVER: the two stay separate. Place a JUNCTION instead and they become one.',
  ],
  grid: { w: 12, h: 9 },
  inputs: [
    { name: 'a', x: 0, y: 2 },
    { name: 'b', x: 0, y: 6 },
  ],
  outputs: [
    { name: 'q1', x: 11, y: 7 },
    { name: 'q2', x: 11, y: 1 },
  ],
  palette: WIRE_X,
  timeline: truthTimeline(['a', 'b'], ['q1', 'q2'], ([a, b]) => [a, b]),
  reference: (w) => {
    path(w, [1, 6], [3, 6], [3, 1], [10, 1]); // b, up and across
    path(w, [1, 2], [5, 2], [5, 7], [10, 7]); // a, crossing it at (3,2)
  },
};

// ------------------------------------------------------------------ chapter 2

const neither: Level = {
  id: 'neither',
  chapter: 2,
  title: 'Neither',
  teaches: 'NOR is one inverter: join, then invert.',
  brief: [
    'OUT is HIGH only when both inputs are LOW.',
    'One inverter and as much wire as you like. When it works, look at what it cost.',
  ],
  grid: { w: 12, h: 7 },
  inputs: [
    { name: 'a', x: 0, y: 2 },
    { name: 'b', x: 0, y: 4 },
  ],
  outputs: [{ name: 'q', x: 11, y: 3 }],
  palette: [...WIRE, 'not'],
  unlocks: 'nor2',
  timeline: truthTimeline(['a', 'b'], ['q'], ([a, b]) => [!(a || b)]),
  reference: (w) => {
    path(w, [1, 2], [7, 2], [7, 4], [1, 4]);
    inv(w, 8, 3);
    run(w, 9, 3, 10, 3);
  },
};

const notBoth: Level = {
  id: 'not-both',
  chapter: 2,
  title: 'Not both',
  teaches: 'NAND is two inverters: invert first, then join.',
  brief: [
    'OUT is LOW only when both inputs are HIGH.',
    'Last level you joined first, then inverted. Try it the other way round, then check whether A and B are still separate.',
  ],
  grid: { w: 14, h: 7 },
  inputs: [
    { name: 'a', x: 0, y: 1 },
    { name: 'b', x: 0, y: 5 },
  ],
  outputs: [{ name: 'q', x: 13, y: 3 }],
  palette: [...WIRE, 'not'],
  unlocks: 'nand2',
  timeline: truthTimeline(['a', 'b'], ['q'], ([a, b]) => [!(a && b)]),
  reference: (w) => {
    run(w, 1, 1, 3, 1);
    inv(w, 4, 1);
    run(w, 1, 5, 3, 5);
    inv(w, 4, 5);
    path(w, [5, 1], [9, 1], [9, 5], [5, 5]);
    run(w, 9, 3, 12, 3);
  },
};

const both: Level = {
  id: 'both',
  chapter: 2,
  title: 'Both',
  teaches: 'AND is NAND, undone. De Morgan, in hardware.',
  brief: [
    'OUT is HIGH only when both inputs are HIGH.',
    'You built most of this last level. It needs one more thing done to it.',
  ],
  grid: { w: 16, h: 7 },
  inputs: [
    { name: 'a', x: 0, y: 1 },
    { name: 'b', x: 0, y: 5 },
  ],
  outputs: [{ name: 'q', x: 15, y: 3 }],
  palette: [...WIRE, 'not'],
  unlocks: 'and2',
  timeline: truthTimeline(['a', 'b'], ['q'], ([a, b]) => [a && b]),
  reference: (w) => {
    run(w, 1, 1, 3, 1);
    inv(w, 4, 1);
    run(w, 1, 5, 3, 5);
    inv(w, 4, 5);
    path(w, [5, 1], [9, 1], [9, 5], [5, 5]);
    inv(w, 10, 3);
    run(w, 11, 3, 14, 3);
  },
};

const copy: Level = {
  id: 'copy',
  chapter: 2,
  title: 'Copy',
  teaches: 'A signal feeding two joins needs two copies.',
  brief: [
    'Q1 is NOR of A and B. Q2 is NOR of A and C.',
    'Both need A. Joining A into the first NOR uses it up, and there is no A left for the second.',
    'So make a second A, driven separately. There is more than one way, and they do not all cost the same.',
  ],
  grid: { w: 16, h: 11 },
  inputs: [
    { name: 'b', x: 0, y: 1 },
    { name: 'a', x: 0, y: 5 },
    { name: 'c', x: 0, y: 9 },
  ],
  outputs: [
    { name: 'q1', x: 15, y: 3 },
    { name: 'q2', x: 15, y: 7 },
  ],
  palette: [...WIRE_X, 'not', 'buf', 'or'],
  timeline: truthTimeline(['a', 'b', 'c'], ['q1', 'q2'], ([a, b, c]) => [!(a || b), !(a || c)]),
  reference: (w) => {
    // A's own net is never joined to anything — both merges use a copy, which
    // is the whole point. Join it once and there is no A left to copy.
    run(w, 1, 5, 3, 5);
    run(w, 1, 1, 6, 1); // B
    run(w, 1, 9, 6, 9); // C

    path(w, [2, 5], [2, 4]); // tap A upward
    buf(w, 2, 3, N);
    path(w, [2, 2], [2, 1]); // copy 1 joins B

    path(w, [3, 5], [3, 6]); // tap A downward
    buf(w, 3, 7, S);
    path(w, [3, 8], [3, 9]); // copy 2 joins C

    inv(w, 7, 1);
    path(w, [8, 1], [14, 1], [14, 3]);
    inv(w, 7, 9);
    path(w, [8, 9], [14, 9], [14, 7]);
  },
};

const oneOrOther: Level = {
  id: 'one-or-other',
  chapter: 2,
  title: 'One or other',
  teaches: 'XOR — and what a textbook formula costs here.',
  brief: [
    'OUT is HIGH when exactly one input is HIGH.',
    'The textbook form is (A OR B) AND NOT (A AND B). It works here. Mind which way you make the OR.',
    'Then look at the tick count. There is an arrangement one tick faster for the same components.',
  ],
  grid: { w: 18, h: 12 },
  inputs: [
    { name: 'a', x: 0, y: 2 },
    { name: 'b', x: 0, y: 10 },
  ],
  outputs: [{ name: 'q', x: 17, y: 6 }],
  palette: [...WIRE_X, 'not', 'buf', 'or'],
  unlocks: 'xor2',
  timeline: truthTimeline(['a', 'b'], ['q'], ([a, b]) => [a !== b]),
  reference: (w) => {
    run(w, 1, 2, 5, 2); // A
    run(w, 1, 10, 10, 10); // B

    path(w, [3, 2], [3, 3]); // copy of A, routed down to the lower merge
    buf(w, 3, 4, S);
    path(w, [3, 5], [3, 9], [12, 9]);

    inv(w, 11, 10); // NOT B
    path(w, [12, 10], [12, 9]);
    inv(w, 13, 9); // NOT (NOT B OR A) = B AND NOT A
    run(w, 14, 9, 14, 9);

    path(w, [6, 10], [6, 8]); // copy of B, routed up to the upper merge
    buf(w, 6, 7, N);
    path(w, [6, 6], [6, 3], [12, 3]);

    inv(w, 6, 2); // NOT A
    path(w, [7, 2], [12, 2], [12, 3]);
    inv(w, 13, 3); // NOT (NOT A OR B) = A AND NOT B
    run(w, 14, 3, 14, 3);

    path(w, [14, 3], [15, 3], [15, 9], [14, 9]); // the two halves join
    run(w, 15, 6, 16, 6);
  },
};

// ------------------------------------------------------------------ chapter 3

const halfAdder: Level = {
  id: 'half-adder',
  chapter: 3,
  title: 'Half adder',
  teaches: 'Two bits, and the first carry.',
  brief: [
    'SUM is the low bit of A plus B. CARRY is the high bit.',
    'Two outputs, both wanting the same two inputs.',
  ],
  grid: { w: 16, h: 11 },
  inputs: [
    { name: 'a', x: 0, y: 1 },
    { name: 'b', x: 0, y: 9 },
  ],
  outputs: [
    { name: 'sum', x: 15, y: 4 },
    { name: 'carry', x: 15, y: 7 },
  ],
  palette: [...WIRE_X, 'not', 'buf', 'or', 'nor2', 'nand2', 'and2', 'xor2'],
  unlocks: 'halfadder',
  timeline: truthTimeline(['a', 'b'], ['sum', 'carry'], ([a, b]) => [a !== b, a && b]),
  reference: (w) => {
    run(w, 1, 1, 2, 1);
    run(w, 1, 9, 4, 9);
    path(w, [2, 1], [2, 3], [5, 3]); // A into the XOR
    path(w, [3, 9], [3, 5], [5, 5]); // B into the XOR
    placeBlueprint(w, 'xor2', 6, 3);
    path(w, [1, 1], [1, 6], [5, 6]); // A into the AND, crossing B's column
    path(w, [4, 9], [4, 8], [5, 8]); // B into the AND
    placeBlueprint(w, 'and2', 6, 6);
    run(w, 8, 4, 14, 4);
    run(w, 8, 7, 14, 7);
  },
};

const fullAdder: Level = {
  id: 'full-adder',
  chapter: 3,
  title: 'Full adder',
  teaches: 'Two half adders, and their carries joined.',
  brief: [
    'Add three bits: A, B and a carry in.',
    'You already have something that adds two of them.',
    'Either stage can raise a carry. Can both, at once?',
  ],
  grid: { w: 20, h: 11 },
  inputs: [
    { name: 'a', x: 0, y: 1 },
    { name: 'b', x: 0, y: 5 },
    { name: 'cin', x: 0, y: 9 },
  ],
  outputs: [
    { name: 'sum', x: 19, y: 3 },
    { name: 'cout', x: 19, y: 7 },
  ],
  palette: [...WIRE_X, 'not', 'buf', 'or', 'and2', 'xor2', 'halfadder'],
  unlocks: 'fulladder',
  timeline: truthTimeline(['a', 'b', 'cin'], ['sum', 'cout'], ([a, b, c]) => {
    const n = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
    return [(n & 1) === 1, n >= 2];
  }),
  reference: (w) => {
    run(w, 1, 1, 5, 1);
    path(w, [1, 5], [5, 5], [5, 4]);
    placeBlueprint(w, 'halfadder', 6, 1);
    run(w, 8, 1, 10, 1); // first sum into the second adder
    path(w, [1, 9], [10, 9], [10, 4]); // carry in
    placeBlueprint(w, 'halfadder', 11, 1);
    path(w, [8, 4], [8, 7], [15, 7]); // first carry, crossing the carry-in column
    path(w, [13, 4], [13, 7]); // second carry joins it
    run(w, 15, 7, 18, 7);
    path(w, [13, 1], [18, 1], [18, 3]);
  },
};

// ------------------------------------------------------------------ chapter 4

/**
 * Chapter 4 is memory, and it has one rule the earlier chapters did not need.
 *
 * A latch that is holding has no simultaneous answer — both sides of the pair
 * would flip together forever — so the tick rule breaks the tie by board order.
 * That means a latch always wakes up in a REAL state, but never a predictable
 * one. No timeline here asserts an output value until the circuit has been set
 * or reset at least once, because a level whose answer moved when you slid a
 * gate sideways would be a broken level.
 */

const hold: Level = {
  id: 'hold',
  chapter: 4,
  title: 'Hold',
  teaches: 'A loop remembers. That is all memory is.',
  brief: [
    'Q goes HIGH the first time A does, and stays HIGH after A lets go.',
    'Everything you have built so far forgets. So give a component its own answer to read.',
    'Careful which one you loop. Inverters in a ring have no settled starting value, and Q has to start LOW here.',
  ],
  grid: { w: 14, h: 7 },
  inputs: [{ name: 'a', x: 0, y: 3 }],
  outputs: [{ name: 'q', x: 13, y: 1 }],
  palette: [...WIRE, 'not', 'buf'],
  timeline: steps(
    ['a'],
    ['q'],
    [
      { in: [0], out: [0] },
      { in: [1], out: [1] },
      { in: [0], out: [1] }, // let go: it must not forget
      { in: [0], out: [1] },
      { in: [1], out: [1] },
      { in: [0], out: [1] },
    ],
  ),
  /**
   * A buffer reading the very net it drives. Once the net is high the buffer
   * keeps it high; until then nothing drives it and the pull-down holds it low,
   * which is why this starts LOW every time. An inverter in the same loop would
   * be a two-gate ring with no settled state at all.
   */
  reference: (w) => {
    run(w, 1, 3, 6, 3); // the node that holds
    path(w, [5, 3], [5, 1], [12, 1]); // out to Q
    buf(w, 7, 3); // reads the node
    path(w, [8, 3], [8, 5], [2, 5], [2, 3]); // and drives it straight back
  },
};

const setReset: Level = {
  id: 'set-reset',
  chapter: 4,
  title: 'Set and reset',
  teaches: 'Two nodes, each holding the other down.',
  brief: [
    'S drives Q high. R drives it low. With both low, Q holds what it had.',
    'Nothing here drives a wire low — it goes low when every driver lets go. So R has to make something let go.',
    'That is what /Q is for: not a second output, but the other half of the circuit.',
  ],
  grid: { w: 14, h: 9 },
  inputs: [
    { name: 's', x: 0, y: 1 },
    { name: 'r', x: 0, y: 7 },
  ],
  outputs: [
    { name: 'q', x: 13, y: 1 },
    { name: 'qbar', x: 13, y: 7 },
  ],
  palette: [...WIRE_X, 'not'],
  unlocks: 'srlatch',
  timeline: steps(
    ['s', 'r'],
    ['q', 'qbar'],
    [
      { in: [0, 1], out: [0, 1] }, // reset first: the latch starts defined
      { in: [0, 0], out: [0, 1] },
      { in: [1, 0], out: [1, 0] },
      { in: [0, 0], out: [1, 0] }, // holds
      { in: [0, 1], out: [0, 1] },
      { in: [0, 0], out: [0, 1] },
      { in: [1, 0], out: [1, 0] },
      { in: [0, 0], out: [1, 0] },
    ],
  ),
  reference: (w) => {
    run(w, 1, 1, 12, 1); // Q node: S merged with the lower inverter's output
    run(w, 1, 7, 12, 7); // Q-BAR node: R merged with the upper inverter's
    path(w, [10, 7], [10, 5]);
    inv(w, 10, 4, N); // reads q-bar, drives q
    path(w, [10, 3], [10, 1]);
    path(w, [3, 1], [3, 3]);
    inv(w, 3, 4, S); // reads q, drives q-bar
    path(w, [3, 5], [3, 7]);
  },
};

const gated: Level = {
  id: 'gated',
  chapter: 4,
  title: 'Gated',
  teaches: 'Memory with a door on it.',
  brief: [
    'EN is a door. While it is open, Q follows D. When it shuts, Q holds what it had.',
    'You have a latch. It has no way of knowing when to listen.',
    'The obvious build gates S and R separately, and it costs. There is a cheaper one: try holding /Q HIGH for as long as the door is open.',
  ],
  grid: { w: 20, h: 11 },
  inputs: [
    { name: 'en', x: 0, y: 1 },
    { name: 'd', x: 0, y: 3 },
  ],
  outputs: [{ name: 'q', x: 19, y: 3 }],
  palette: [...WIRE_X, 'not', 'buf', 'or', 'srlatch'],
  unlocks: 'dlatch',
  timeline: steps(
    ['d', 'en'],
    ['q'],
    [
      { in: [0, 1], out: [0] }, // open with d low, so the state is defined
      { in: [1, 0], out: [0] }, // shut, d rises: must hold low
      { in: [1, 1], out: [1] }, // open: follows
      { in: [1, 0], out: [1] }, // shut: holds high
      { in: [0, 0], out: [1] }, // d falls behind the door: still holds
      { in: [0, 1], out: [0] }, // open: follows down
      { in: [1, 0], out: [0] }, // rises behind the door: holds low
      { in: [1, 1], out: [1] }, // open: follows up
    ],
  ),
  /**
   *   n2 = NOT(d) | NOT(en)     the set term, active low
   *   Q  = NOT(n2) | NOT(qbar)
   *   qbar = NOT(Q) | BUF(en)   forced high while the door is open
   *
   * Rows are ordered so nothing crosses: d only feeds one inverter, so its
   * spine is short and the risers pass it by.
   */
  reference: (w) => {
    run(w, 1, 1, 16, 1); // en, long: an inverter and the buffer both read it
    run(w, 1, 3, 5, 3); // d, short: only one inverter reads it

    inv(w, 5, 4, S); // NOT(d) -> n2
    path(w, [8, 1], [8, 2]);
    inv(w, 8, 3, S); // NOT(en) -> n2, threading past the short d spine
    path(w, [8, 4], [8, 5]);
    run(w, 4, 5, 11, 5); // n2

    inv(w, 11, 6, S); // NOT(n2) -> Q
    run(w, 2, 7, 15, 7); // Q
    inv(w, 15, 8, N); // NOT(qbar) -> Q
    inv(w, 2, 8, S); // NOT(Q) -> qbar
    run(w, 2, 9, 16, 9); // qbar

    path(w, [16, 1], [16, 6]); // en down the right, past both short spines
    buf(w, 16, 7, S); // BUF(en) -> qbar
    path(w, [16, 8], [16, 9]);

    path(w, [13, 7], [13, 3], [18, 3]); // Q out, over the top of everything
  },
};

const edge: Level = {
  id: 'edge',
  chapter: 4,
  title: 'Edge',
  teaches: 'Two doors that are never open at once.',
  brief: [
    'Q takes whatever D is at the instant the clock RISES, and ignores D between rises.',
    'Your latch is transparent: while its door is open, Q chases D.',
    'You can place two doors. They do not have to be open at the same time.',
  ],
  grid: { w: 20, h: 13 },
  inputs: [
    { name: 'd', x: 0, y: 1 },
    { name: 'clk', x: 0, y: 11 },
  ],
  outputs: [{ name: 'q', x: 19, y: 6 }],
  palette: [...WIRE_X, 'not', 'buf', 'dlatch'],
  unlocks: 'dff',
  timeline: steps(
    ['d', 'clk'],
    ['q'],
    [
      // a latch's power-on value is decided by board order, so nothing is
      // claimed until the first edge has loaded a value we chose
      { in: [0, 1], out: [null] },
      { in: [0, 0], out: [0] },
      { in: [1, 1], out: [1] }, // rise samples d=1
      { in: [0, 1], out: [1] }, // clock STILL high, d falls: transparent would follow
      { in: [0, 0], out: [1] },
      { in: [0, 1], out: [0] }, // rise samples d=0
      { in: [1, 1], out: [0] }, // still high, d rises: must hold
      { in: [1, 0], out: [0] },
      { in: [1, 1], out: [1] }, // rise samples d=1
    ],
  ),
  reference: (w) => {
    run(w, 1, 1, 6, 1); // d into the master's door
    run(w, 1, 11, 15, 11); // the clock

    path(w, [2, 11], [2, 3]); // clock up the left, clear of both tiles
    inv(w, 3, 3); // NOT(clk): the master is open while the clock is LOW
    run(w, 4, 3, 6, 3); // and into the master's door
    placeBlueprint(w, 'dlatch', 7, 1);

    path(w, [9, 2], [11, 2], [11, 5]); // master's q into the slave's d
    path(w, [15, 11], [15, 9], [11, 9], [11, 7]); // the clock into the slave's door
    placeBlueprint(w, 'dlatch', 12, 5);

    run(w, 14, 6, 18, 6);
  },
};

export const LEVELS: Level[] = [
  continuity,
  invert,
  fanout,
  either,
  crossing,
  neither,
  notBoth,
  both,
  copy,
  oneOrOther,
  halfAdder,
  fullAdder,
  hold,
  setReset,
  gated,
  edge,
];

export const LEVELS_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
