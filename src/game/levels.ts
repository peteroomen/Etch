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

import { Kind, N, S, W } from '../sim/kinds';
import { bp, buf, inv, path, run } from '../sim/build';
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
    'The inverter drives its output HIGH while its input is LOW.',
    'When the input goes HIGH it lets go. A wire nothing is holding falls LOW on its own.',
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
    'Loop the wrong component and Q wakes up HIGH.',
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

const enable: Level = {
  id: 'enable',
  chapter: 4,
  title: 'Enable',
  teaches: 'A latch you can only set when you are allowed to.',
  brief: [
    'S sets Q — but only while EN is HIGH. R resets it whatever EN is doing.',
    'Your latch takes S at its word. This one has to check something first, and you cannot afford an AND gate to do the checking.',
    'So make the latch do it. Both S and EN have to be HIGH at the same moment to pull it over — and once it is over, it holds itself there.',
  ],
  grid: { w: 16, h: 9 },
  inputs: [
    { name: 's', x: 0, y: 1 },
    { name: 'r', x: 0, y: 3 },
    { name: 'en', x: 0, y: 5 },
  ],
  outputs: [{ name: 'q', x: 15, y: 7 }],
  palette: [...WIRE_X, 'not'],
  timeline: steps(
    ['s', 'en', 'r'],
    ['q'],
    [
      { in: [0, 0, 1], out: [0] }, // reset first, so the latch starts defined
      { in: [0, 0, 0], out: [0] },
      { in: [1, 0, 0], out: [0] }, // S alone: the door is shut
      { in: [0, 0, 0], out: [0] },
      { in: [0, 1, 0], out: [0] }, // EN alone: nothing to let in
      { in: [0, 0, 0], out: [0] },
      { in: [1, 1, 0], out: [1] }, // both, together: sets
      { in: [0, 0, 0], out: [1] }, // and holds
      { in: [0, 0, 1], out: [0] }, // R wins whatever the door is doing
      { in: [0, 0, 0], out: [0] },
      { in: [1, 1, 0], out: [1] },
      { in: [0, 0, 0], out: [1] },
    ],
  ),
  /**
   * The AND is fused into the latch rather than stacked in front of it.
   *
   *   n0 = s  | NOT(n2)
   *   n1 = en | NOT(n2)
   *   n2 = r  | NOT(n0) | NOT(n1)
   *   q  = NOT(n2)
   *
   * While n2 is high both feedback inverters are letting go, so n0 is just S
   * and n1 is just EN — and only both together can pull n2 down. Once it is
   * down, NOT(n2) holds them both up on its own, which is the hold.
   */
  reference: (w) => {
    run(w, 1, 1, 7, 1); // n0 = s, and the feedback
    run(w, 1, 3, 11, 3); // n2 = r, and the two set legs
    run(w, 1, 5, 7, 5); // n1 = en, and the feedback

    inv(w, 3, 2, N); // NOT(n2) -> n0
    inv(w, 6, 2, S); // NOT(n0) -> n2
    inv(w, 3, 4, S); // NOT(n2) -> n1
    inv(w, 6, 4, N); // NOT(n1) -> n2

    path(w, [9, 3], [9, 5]); // n2 down past the short en spine
    inv(w, 9, 6, S); // NOT(n2) -> Q
    run(w, 9, 7, 14, 7);
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
    'Try holding /Q HIGH for as long as the door is open.',
  ],
  grid: { w: 20, h: 11 },
  inputs: [
    { name: 'd', x: 0, y: 1 },
    { name: 'en', x: 0, y: 7 },
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
   * The cross-coupled pair at the heart of this IS the latch from two levels
   * ago, so the reference places that tile rather than rebuilding it from
   * inverters. It bills the same six components either way — but the tile
   * folds all of the feedback routing into one block, and routing is most of
   * what the area score is made of.
   *
   *   n2 = NOT(d) | NOT(en)   the set term, active low
   *   S  = NOT(n2)            into the latch, which holds Q
   *   R  = BUF(en)            asserted while the door is open, so Q follows n2
   *
   * Both feeds meet the tile pin against pin, with no wire between them at all.
   */
  reference: (w) => {
    run(w, 1, 1, 3, 1); // d, short: one inverter reads it
    run(w, 1, 7, 9, 7); // en

    inv(w, 3, 2, S); // NOT(d) -> n2
    path(w, [5, 7], [5, 5]);
    inv(w, 5, 4, N); // NOT(en) -> n2
    run(w, 3, 3, 9, 3); // n2

    inv(w, 10, 3); // NOT(n2) -> the latch's S
    path(w, [9, 7], [9, 5]);
    buf(w, 10, 5); // BUF(en) -> the latch's R

    placeBlueprint(w, 'srlatch', 11, 3);
    run(w, 13, 3, 18, 3); // Q out
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

const divide: Level = {
  id: 'divide',
  chapter: 4,
  title: 'Divide',
  teaches: 'The first circuit that counts.',
  brief: [
    'Q must change state on every rising edge of the clock, and hold across every fall. It comes out at half the clock speed.',
    'Your flip-flop copies D on each rising edge. You want it to do the opposite of what it is doing.',
    'So tell it the opposite. There is only one signal on the board that always knows.',
  ],
  grid: { w: 20, h: 12 },
  inputs: [{ name: 'clk', x: 0, y: 6 }],
  outputs: [{ name: 'q', x: 17, y: 5 }],
  palette: [...WIRE_X, 'not', 'dff'],
  timeline: steps(
    ['clk'],
    ['q'],
    [
      { in: [0], out: [0] },
      { in: [1], out: [1] }, // rise: toggles
      { in: [0], out: [1] }, // fall: holds
      { in: [1], out: [0] },
      { in: [0], out: [0] },
      { in: [1], out: [1] },
      { in: [0], out: [1] },
      { in: [1], out: [0] },
      { in: [0], out: [0] },
    ],
  ),
  /**
   * Q inverted, back into D. On every rising edge the flip-flop copies the
   * opposite of what it is holding, so it flips — and since it only looks on an
   * edge, the feedback cannot race it round the loop.
   *
   * The output's starting value is decided by the tick rule's tie-break, but
   * the flip-flop's insides are always emitted in the same order however the
   * tile is placed, so every board that uses it wakes the same way. A test
   * builds this at three offsets and requires an identical trace.
   */
  reference: (w) => {
    run(w, 1, 6, 7, 6); // the clock, into the tile
    placeBlueprint(w, 'dff', 8, 4);
    run(w, 10, 5, 16, 5); // Q out
    path(w, [12, 5], [12, 2], [6, 2]); // and back round
    inv(w, 6, 3, S); // NOT(Q)
    run(w, 6, 4, 7, 4); // into D
  },
};

// ------------------------------------------------------------------ chapter 5

/**
 * Chapter 5 is width, counting, and the first thing on the board that shows a
 * NUMBER rather than a light.
 *
 * Two of its levels cannot be reset. A counter has no load input, so it starts
 * from wherever the tick rule's tie-break puts it — safe only because a tile's
 * insides are emitted in the same order however it is placed, which the offsets
 * test in chapter5.test.ts is there to keep true.
 */

const SEG = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/** Which segments each digit lights. The ordinary shapes, not invented ones. */
const DIGIT: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
};

const litFor = (digit: number): boolean[] => SEG.map((s) => DIGIT[digit].includes(s));

const twoOfThem: Level = {
  id: 'two-of-them',
  chapter: 5,
  title: 'Two of them',
  teaches: 'A register is one flip-flop per bit, on one clock.',
  brief: [
    'Q0 follows D0 and Q1 follows D1, both taking their new value on the same rising edge.',
    'Nothing new to invent. The only question is what the clock has to reach, and what that costs you.',
  ],
  grid: { w: 16, h: 11 },
  inputs: [
    { name: 'd0', x: 0, y: 1 },
    { name: 'd1', x: 0, y: 5 },
    { name: 'clk', x: 0, y: 9 },
  ],
  outputs: [
    { name: 'q0', x: 15, y: 2 },
    { name: 'q1', x: 15, y: 6 },
  ],
  palette: [...WIRE_X, 'not', 'buf', 'dff'],
  unlocks: 'reg2',
  timeline: steps(
    ['d0', 'd1', 'clk'],
    ['q0', 'q1'],
    [
      { in: [0, 0, 0], out: [null, null] }, // nothing loaded yet
      { in: [1, 0, 1], out: [1, 0] }, // the rise takes both bits
      { in: [0, 1, 0], out: [1, 0] }, // and they hold across the fall
      { in: [0, 1, 1], out: [0, 1] }, // the bits are independent
      { in: [1, 1, 0], out: [0, 1] },
      { in: [1, 1, 1], out: [1, 1] },
      { in: [0, 0, 0], out: [1, 1] },
      { in: [0, 0, 1], out: [0, 0] },
    ],
  ),
  reference: (w) => {
    run(w, 1, 1, 9, 1); // d0
    run(w, 1, 5, 9, 5); // d1
    bp(w, 'dff', 10, 1);
    bp(w, 'dff', 10, 5);

    // one clock net, read twice: the second flip-flop costs a wire, not a copy
    path(w, [1, 9], [7, 9], [7, 3], [9, 3]); // crossing d1 on the way up
    path(w, [7, 7], [9, 7]);

    run(w, 12, 2, 14, 2);
    run(w, 12, 6, 14, 6);
  },
};

const onlyWhenTold: Level = {
  id: 'only-when-told',
  chapter: 5,
  title: 'Only when told',
  teaches: 'A register that ignores the clock unless it is addressed.',
  brief: [
    'Q takes D on a rising edge, but only while WE is HIGH. With WE LOW the edge must change nothing.',
    'You cannot stop the clock — every register in a machine shares one.',
    'So give the flip-flop something harmless to swallow instead.',
  ],
  grid: { w: 18, h: 12 },
  inputs: [
    { name: 'd', x: 0, y: 1 },
    { name: 'we', x: 0, y: 3 },
    { name: 'clk', x: 0, y: 11 },
  ],
  outputs: [{ name: 'q', x: 17, y: 4 }],
  palette: [...WIRE_X, 'not', 'buf', 'dff'],
  unlocks: 'regwe',
  timeline: steps(
    ['d', 'we', 'clk'],
    ['q'],
    [
      { in: [0, 1, 0], out: [null] },
      { in: [0, 1, 1], out: [0] }, // written
      { in: [1, 1, 0], out: [0] },
      { in: [1, 1, 1], out: [1] }, // written
      { in: [0, 0, 0], out: [1] },
      { in: [0, 0, 1], out: [1] }, // an edge with WE low changes nothing
      { in: [1, 0, 0], out: [1] },
      { in: [1, 0, 1], out: [1] }, // nor does this one
      { in: [0, 1, 0], out: [1] },
      { in: [0, 1, 1], out: [0] }, // written again
      { in: [1, 0, 0], out: [0] },
      { in: [1, 0, 1], out: [0] },
    ],
  ),
  /**
   * A two-way switch in front of the flip-flop:
   *
   *   n4 = NOT(d)  | NOT(we)          n6 = NOT(n4) | NOT(n5)
   *   n5 = NOT(q)  | BUF(we)          q  = flip-flop(n6, clk)
   *
   * NOT(n4) is d AND we, NOT(n5) is q AND NOT we, and the merge of the two is
   * the OR that picks between them — free, because both are fresh driven nets.
   * With WE low the flip-flop is handed its own output, so the edge writes back
   * what was already there.
   */
  reference: (w) => {
    run(w, 1, 1, 3, 1); // d
    run(w, 1, 3, 3, 3); // we
    inv(w, 4, 1);
    inv(w, 4, 3);
    path(w, [5, 1], [5, 3]); // n4
    inv(w, 6, 2); // d AND we

    path(w, [2, 3], [2, 6]); // we, tapped for the other arm
    buf(w, 2, 7, S);

    path(w, [14, 4], [14, 8], [6, 8]); // q, back round the bottom
    inv(w, 5, 8, W); // NOT(q)
    run(w, 2, 8, 4, 8); // n5: the two arms of the switch meet
    inv(w, 3, 9, S); // q AND NOT we

    run(w, 7, 2, 9, 2); // n6, joined from both arms
    path(w, [9, 2], [9, 10], [3, 10]);
    run(w, 9, 3, 10, 3);

    path(w, [1, 11], [8, 11], [8, 5], [10, 5]); // clk, up the outside and back in
    bp(w, 'dff', 11, 3);
    run(w, 13, 4, 16, 4);
  },
};

const countToThree: Level = {
  id: 'count-to-three',
  chapter: 5,
  title: 'Count to three',
  teaches: 'Chain two dividers and you are counting.',
  brief: [
    'Q0 and Q1 are the two bits of a number that goes 0, 1, 2, 3 and starts again, one step per rising edge.',
    'You built the low bit last chapter — it halves the clock.',
    'The high bit wants its own clock, and there is already a signal on the board ticking at the right speed.',
  ],
  grid: { w: 18, h: 11 },
  inputs: [{ name: 'clk', x: 0, y: 5 }],
  outputs: [
    { name: 'q0', x: 17, y: 2 },
    { name: 'q1', x: 17, y: 7 },
  ],
  palette: [...WIRE_X, 'not', 'dff'],
  unlocks: 'count2',
  timeline: steps(
    ['clk'],
    ['q0', 'q1'],
    [
      { in: [0], out: [0, 0] },
      { in: [1], out: [1, 0] }, // 1
      { in: [0], out: [1, 0] },
      { in: [1], out: [0, 1] }, // 2
      { in: [0], out: [0, 1] },
      { in: [1], out: [1, 1] }, // 3
      { in: [0], out: [1, 1] },
      { in: [1], out: [0, 0] }, // and round again
      { in: [0], out: [0, 0] },
    ],
  ),
  /**
   * NOT(q0) does both jobs. It is the low flip-flop's own D, which is what makes
   * it toggle, and it is the high flip-flop's clock — so the high bit steps
   * every time q0 falls, which is every second step of the low bit.
   */
  reference: (w) => {
    bp(w, 'dff', 8, 1);
    bp(w, 'dff', 8, 6);
    run(w, 10, 2, 16, 2); // q0
    run(w, 10, 7, 16, 7); // q1

    path(w, [12, 2], [12, 4], [4, 4]); // q0 back to the left
    path(w, [1, 5], [6, 5], [6, 3], [7, 3]); // the clock, crossing it
    inv(w, 3, 4, W);

    // one net, two jobs: the low bit's own D, and the high bit's clock
    path(w, [2, 4], [2, 1], [7, 1]);
    path(w, [2, 4], [2, 8], [7, 8]); // crossing the clock on the way down

    path(w, [12, 7], [12, 9], [6, 9]); // q1 back
    inv(w, 5, 9, W);
    path(w, [4, 9], [4, 6], [7, 6]); // NOT(q1) as the high bit's D
  },
};

const oneOfFour: Level = {
  id: 'one-of-four',
  chapter: 5,
  title: 'One of four',
  teaches: 'A two-bit number, turned into four lines.',
  brief: [
    'A and B are the two bits of a number. Exactly one of the four outputs is HIGH: the one the number names.',
    'Each line has to check both bits. Nothing is stopping two lines checking the same bit — reading is free.',
    'What is not free is joining. Every line wants its own copy of what it merges.',
  ],
  grid: { w: 18, h: 14 },
  inputs: [
    { name: 'a', x: 0, y: 1 },
    { name: 'b', x: 0, y: 12 },
  ],
  outputs: [
    { name: 'n0', x: 17, y: 2 },
    { name: 'n1', x: 17, y: 5 },
    { name: 'n2', x: 17, y: 8 },
    { name: 'n3', x: 17, y: 11 },
  ],
  palette: [...WIRE_X, 'not', 'buf', 'or'],
  unlocks: 'dec24',
  timeline: truthTimeline(['a', 'b'], ['n0', 'n1', 'n2', 'n3'], ([a, b]) => [
    !a && !b,
    a && !b,
    !a && b,
    a && b,
  ]),
  /**
   * Four NORs, which is the cheapest gate here: a merge costs nothing and the
   * inverter over it costs one. Each line needs its OWN copy of each bit,
   * because the merge that makes the NOR consumes what it merges — so the two
   * rails down the left are read eight times and joined never.
   */
  reference: (w) => {
    path(w, [1, 1], [2, 1], [2, 13]); // rail a
    path(w, [1, 12], [3, 12]); // b, crossing it
    path(w, [3, 12], [3, 3]); // rail b

    // row, what each copy does: NOR(±a, ±b) is one line of the decoder
    const lines: [number, 'not' | 'buf', 'not' | 'buf'][] = [
      [2, 'buf', 'buf'], // n0 = NOT a AND NOT b
      [5, 'not', 'buf'], // n1 =     a AND NOT b
      [8, 'buf', 'not'], // n2 = NOT a AND     b
      [11, 'not', 'not'], // n3 =     a AND     b
    ];
    for (const [row, ka, kb] of lines) {
      run(w, 2, row, 4, row); // a, crossing rail b
      (ka === 'not' ? inv : buf)(w, 5, row);
      run(w, 3, row + 1, 4, row + 1); // b
      (kb === 'not' ? inv : buf)(w, 5, row + 1);
      path(w, [6, row], [6, row + 1]); // the merge, and the OR it buys
      inv(w, 7, row);
      run(w, 8, row, 16, row);
    }
  },
};

const naughtAndOne: Level = {
  id: 'naught-and-one',
  chapter: 5,
  title: 'Naught and one',
  teaches: 'Seven lamps in the shape of a digit.',
  brief: [
    'The display has seven segments and seven wires. Light the ones that draw a 0 when X is LOW, and a 1 when X is HIGH.',
    'One segment is dark in both digits. It needs nothing at all — a wire nobody drives is already LOW.',
    'Two are lit in both. There is no HIGH to wire them to, so you will have to make one.',
  ],
  grid: { w: 13, h: 10 },
  inputs: [{ name: 'x', x: 0, y: 5 }],
  outputs: [],
  display: { kind: Kind.Seg7, x: 10, y: 2 },
  palette: [...WIRE_X, 'not', 'buf'],
  timeline: truthTimeline(['x'], SEG, ([x]) => litFor(x ? 1 : 0)),
  /**
   * Four segments want NOT(x) and they share ONE inverter, because a driven net
   * may be read by as many things as like. Two want a constant HIGH, and the
   * cheapest constant in this substrate is a signal merged with its own
   * inverse: NOT(x) OR x is true whatever x is doing.
   */
  reference: (w) => {
    run(w, 1, 5, 3, 5);
    inv(w, 4, 5); // NOT(x): segments a, d, e and f
    run(w, 5, 5, 8, 5);
    path(w, [8, 2], [8, 7]);
    run(w, 8, 2, 9, 2); // a
    run(w, 8, 5, 9, 5); // d
    run(w, 8, 6, 9, 6); // e
    run(w, 8, 7, 9, 7); // f

    path(w, [3, 5], [3, 2]); // x, tapped upward
    buf(w, 4, 2);
    inv(w, 4, 3);
    path(w, [5, 2], [5, 3]); // NOT(x) OR x — lit whatever x does
    run(w, 5, 3, 7, 3);
    path(w, [7, 3], [7, 4]);
    run(w, 7, 3, 9, 3); // b, crossing the other line
    run(w, 7, 4, 9, 4); // c
    // g is lit by neither digit, so nothing drives it
  },
};

const everyDigit: Level = {
  id: 'every-digit',
  chapter: 5,
  title: 'Every digit',
  teaches: 'A diode matrix: one line per digit, one column per segment.',
  brief: [
    'Exactly one of N0 to N3 is HIGH, naming a digit. Draw that digit.',
    'Work one segment at a time, not one digit at a time. Ask which lines light this segment, and wire that.',
    'One segment is another segment. One is lit for every digit but one. One is lit for all four, and one needs no component at all.',
  ],
  grid: { w: 19, h: 14 },
  inputs: [
    { name: 'n0', x: 0, y: 0 },
    { name: 'n1', x: 0, y: 1 },
    { name: 'n2', x: 0, y: 2 },
    { name: 'n3', x: 0, y: 3 },
  ],
  outputs: [],
  display: { kind: Kind.Seg7, x: 16, y: 4 },
  palette: [...WIRE_X, 'not', 'buf'],
  unlocks: 'digit4',
  /**
   * Only the four one-hot cases. Anything else cannot reach this circuit — a
   * decoder is what feeds it — and demanding an answer for input the machine
   * never produces would make the level harder for no reason at all.
   */
  timeline: steps(
    ['n0', 'n1', 'n2', 'n3'],
    SEG,
    [0, 1, 2, 3].map((digit) => ({
      in: [0, 1, 2, 3].map((i) => (i === digit ? 1 : 0)),
      out: litFor(digit).map((v) => (v ? 1 : 0)),
    })),
  ),
  /**
   * Four rails down the left, read as often as they like, joined never.
   *
   *   a, d  NOT(n1)         one net, read by two segments
   *   b     NOT(n1) | n1    HIGH by construction: cheaper than merging all four
   *   c     NOT(n2)
   *   e     n0 | n2
   *   f     n0              no component: the rail already is the answer
   *   g     n2 | n3
   */
  reference: (w) => {
    // n0 runs one row deeper than the rest so its last tap can pass under them
    path(w, [1, 0], [4, 0], [4, 13]); // n0
    path(w, [1, 1], [5, 1], [5, 12]); // n1
    path(w, [1, 2], [6, 2], [6, 12]); // n2
    path(w, [1, 3], [7, 3], [7, 12]); // n3

    /** one component at x=9, fed east off a rail. */
    const tap = (rail: number, row: number, kind: 'not' | 'buf') => {
      run(w, rail, row, 8, row);
      (kind === 'not' ? inv : buf)(w, 9, row);
    };

    tap(5, 4, 'not'); //  a and d
    tap(5, 5, 'not'); //  b ┐
    tap(6, 6, 'not'); //  c
    tap(5, 8, 'buf'); //  b ┘
    tap(4, 9, 'buf'); //  e ┐
    tap(6, 10, 'buf'); // e ┘
    tap(6, 11, 'buf'); // g ┐
    tap(7, 12, 'buf'); // g ┘

    path(w, [10, 4], [12, 4], [12, 7]); // a and d off one net
    run(w, 12, 4, 15, 4);
    run(w, 12, 7, 15, 7);

    path(w, [10, 5], [11, 5], [11, 8], [10, 8]); // b
    run(w, 11, 5, 15, 5);

    run(w, 10, 6, 15, 6); // c

    path(w, [10, 9], [10, 10]); // e: the two copies meet where they leave
    path(w, [10, 9], [13, 9], [13, 8]);
    run(w, 13, 8, 15, 8);

    path(w, [10, 11], [10, 12]); // g
    path(w, [10, 11], [12, 11], [12, 10]);
    run(w, 12, 10, 15, 10);

    run(w, 4, 13, 14, 13); // f, straight off the n0 rail
    path(w, [14, 13], [14, 9]);
    run(w, 14, 9, 15, 9);
  },
};

const showTheCount: Level = {
  id: 'show-the-count',
  chapter: 5,
  title: 'Show the count',
  teaches: 'Everything you built, counting on a display.',
  brief: [
    'One clock in. A digit out, counting 0, 1, 2, 3 and starting again.',
    'You have all three pieces. This is the wiring.',
  ],
  grid: { w: 18, h: 9 },
  inputs: [{ name: 'clk', x: 0, y: 1 }],
  outputs: [],
  display: { kind: Kind.Seg7, x: 15, y: 1 },
  palette: [...WIRE_X, 'not', 'buf', 'count2', 'dec24', 'digit4'],
  timeline: steps(
    ['clk'],
    SEG,
    [0, 1, 0, 1, 0, 1, 0, 1, 0].map((clk, i) => ({
      in: [clk],
      // 0,1,1,2,2,3,3,0,0 — the count only moves on a rise
      out: litFor(Math.floor((i + 1) / 2) % 4).map((v) => (v ? 1 : 0)),
    })),
  ),
  reference: (w) => {
    run(w, 1, 1, 2, 1);
    bp(w, 'count2', 3, 1);
    run(w, 5, 1, 6, 1); // q0 into the decoder's low bit
    path(w, [5, 3], [6, 3], [6, 5]); // q1 into its high bit
    bp(w, 'dec24', 7, 1);
    for (let r = 1; r <= 4; r++) run(w, 9, r, 10, r); // the four lines
    bp(w, 'digit4', 11, 1);
    for (let r = 1; r <= 7; r++) run(w, 13, r, 14, r); // the seven segments
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
  enable,
  gated,
  edge,
  divide,
  twoOfThem,
  onlyWhenTold,
  countToThree,
  oneOfFour,
  naughtAndOne,
  everyDigit,
  showTheCount,
];

export const LEVELS_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
