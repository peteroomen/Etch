/**
 * Chapter 4, re-measured under the tiebreak rule.
 *
 * Every earlier number came from a search assuming simultaneous update, so none
 * of them can be trusted now. This is the authoritative run.
 *
 * Note what the timelines do NOT do: none of them asserts a required value at
 * step 0 while the circuit is in a hold state. A latch's power-on value is
 * decided by board order, so a level that depended on it would be a level whose
 * answer moves when you slide a gate sideways.
 */
import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, synthesiseSeq } from '../src/model/seq';

interface Case {
  name: string;
  ins: string[];
  outs: string[];
  spec: SeqSpec;
  maxParts: number;
}

const V: [string, PartKind[]][] = [
  ['NOT only', ['not']],
  ['NOT+BUF', ['not', 'buf']],
  ['NOT+OR', ['not', 'or']],
];

const cases: Case[] = [
  {
    name: 'Hold — Q latches high on the first pulse and never falls',
    ins: ['a'],
    outs: ['q'],
    maxParts: 4,
    spec: {
      k: 1,
      inputs: [[false], [true], [false], [false], [true], [false]],
      outputs: [[false, true, true, true, true, true]],
    },
  },
  {
    name: 'Set and reset — the SR latch',
    ins: ['s', 'r'],
    outs: ['q'],
    maxParts: 4,
    spec: {
      k: 2,
      inputs: [
        [false, true],
        [false, false],
        [true, false],
        [false, false],
        [false, true],
        [false, false],
        [true, false],
        [false, false],
      ],
      outputs: [[false, false, true, true, false, false, true, true]],
    },
  },
  {
    name: 'Set and reset, with q-bar required too',
    ins: ['s', 'r'],
    outs: ['q', 'qbar'],
    maxParts: 4,
    spec: {
      k: 2,
      inputs: [
        [false, true],
        [false, false],
        [true, false],
        [false, false],
        [false, true],
        [false, false],
      ],
      outputs: [
        [false, false, true, true, false, false],
        [true, true, false, false, true, true],
      ],
    },
  },
  {
    name: 'Gated — the D latch, opening with the door SHUT',
    ins: ['d', 'en'],
    outs: ['q'],
    maxParts: 7,
    spec: {
      k: 2,
      inputs: [
        [false, true], // open with the door ajar and d low, so q is defined
        [true, false], // shut it, d rises: must hold low
        [true, true], // open: follows up
        [true, false], // shut: holds high
        [false, false], // d falls behind the door: still holds
        [false, true], // open: follows down
        [true, false], // rises behind the door: holds low
        [true, true], // open: follows up
      ],
      outputs: [[false, false, true, true, true, false, false, true]],
    },
  },
];

for (const c of cases) {
  console.log(`\n## ${c.name}`);
  for (const [label, kinds] of V) {
    const t0 = Date.now();
    const r = synthesiseSeq({ spec: c.spec, kinds, maxParts: c.maxParts, nodeBudget: 60_000_000 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `  ${label.padEnd(10)} ${(r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || `none at <=${c.maxParts}`).padEnd(22)}` +
        `${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${secs}s`,
    );
    if (r.frontier[0]) console.log(`      ${describeSeq(r.frontier[0].circuit, c.ins, c.outs)}`);
  }
}
