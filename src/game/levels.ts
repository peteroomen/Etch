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
import { Level, truthTimeline } from './level';

const WIRE = ['wire'];
const WIRE_X = ['wire', 'cross'];

// ------------------------------------------------------------------ chapter 1

const continuity: Level = {
  id: 'continuity',
  chapter: 1,
  title: 'Continuity',
  teaches: 'A wire is a node, not a pipe.',
  brief: [
    'Connect IN to OUT.',
    'Every wire cell you join into one run is a single electrical node. Signal across it is instantaneous — there is no delay in wire, only in components.',
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
    'The inverter is the only active component you have. It drives its output HIGH when its input is LOW, and lets go otherwise — every net has a weak pull-down that supplies the zero.',
    'It answers one tick after its input changes.',
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
    'One node can be read by as many things as you like at no cost. Later you will find that JOINING nets is the expensive direction — but reading is free.',
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
    'There is no OR component, and there does not need to be one. Drive one node from two places and it reads HIGH when either driver pulls it high. OR costs nothing and takes no tick.',
    'Note what it costs instead: A and B are now the same node. They cannot be told apart again downstream.',
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
    'Two runs drawn over each other become a CROSSOVER: the two axes stay separate nodes. To join instead, place a JUNCTION.',
    'Crossing is the default because on a small screen you will draw over an existing run constantly.',
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
    'You already know how to OR — join the nets. Invert the result and you have NOR, for the price of a single component.',
    'This is the cheapest gate in this universe. Remember that; the ordering is not the one you were taught.',
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
    'NOT A OR NOT B. Invert each input, then join the two inverter outputs.',
    'Because you joined outputs rather than inputs, A and B survive this gate — you can still use them elsewhere. That distinction is about to matter.',
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
    'You are holding most of the answer already: NOT (NOT A OR NOT B).',
    'Three components and two ticks — the dearest of the three basic gates here, and the exact inverse of what silicon would charge you.',
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
    'Both need A. But joining A into the first NOR consumes it — A and B become one node, and there is no A left to give the second.',
    'You can already do this. A copy is two inverters back to back, and that route costs five components and three ticks.',
    'Two cheaper ways. BUF drives a new node with the value it reads — one component, one tick, an independent copy. Or the OR gate, which reads both its inputs rather than merging them. Either gets you to four and two.',
    'Here the two cost exactly the same. They will not always.',
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
  teaches: 'XOR, the way this substrate allows it.',
  brief: [
    'OUT is HIGH when exactly one input is HIGH.',
    'The textbook form is (A OR B) AND NOT (A AND B). It cannot be built here: computing A OR B destroys the A and B the second half still needs.',
    'Build (A AND NOT B) OR (NOT A AND B) instead. Each half joins an inverter output with a copy, so nothing is consumed before it has been used.',
    'Inverters alone will do it in eight. With a cheap copy it comes down to six.',
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
    'Both gates read A and B, and reading is free — only joining consumes. Route each input to both gates.',
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
    'Two half adders in series give the sum. Either of them may produce a carry, and both are inverter outputs — so joining them is safe.',
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
];

export const LEVELS_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
