/**
 * Model chapter 4 before building it.
 *
 * Every number printed here is measured by exhaustive search over the same
 * synchronous update the game uses, so a par it reports is reachable on a real
 * board and an oscillation it reports is one a player would hit.
 */

import { PartKind } from '../src/model/synth';
import { SeqSpec, describeSeq, hasFeedback, synthesiseSeq } from '../src/model/seq';

interface Case {
  name: string;
  ins: string[];
  outs: string[];
  spec: SeqSpec;
  /** vocabularies to try, cheapest first */
  palettes: { label: string; kinds: PartKind[] }[];
  maxParts: number;
}

const V = {
  wire: { label: 'NOT only', kinds: ['not'] as PartKind[] },
  copier: { label: 'NOT+BUF', kinds: ['not', 'buf'] as PartKind[] },
  gater: { label: 'NOT+OR', kinds: ['not', 'or'] as PartKind[] },
  all: { label: 'everything', kinds: ['not', 'buf', 'or'] as PartKind[] },
};

/** Columns of a hand-written timeline, transposed into the shape the search wants. */
function timeline(
  ins: string[],
  outs: string[],
  rows: [number[], (number | null)[]][],
): SeqSpec {
  return {
    k: ins.length,
    inputs: rows.map((r) => r[0].map(Boolean)),
    outputs: outs.map((_, i) => rows.map((r) => (r[1][i] === null ? null : Boolean(r[1][i])))),
  };
}

const cases: Case[] = [
  {
    name: 'Hold',
    ins: ['a'],
    outs: ['q'],
    maxParts: 4,
    palettes: [V.wire, V.copier, V.gater, V.all],
    spec: timeline(
      ['a'],
      ['q'],
      [
        [[0], [0]],
        [[1], [1]],
        [[0], [1]],
        [[0], [1]],
        [[1], [1]],
        [[0], [1]],
      ],
    ),
  },
  {
    name: 'Set and reset',
    ins: ['s', 'r'],
    outs: ['q'],
    maxParts: 4,
    palettes: [V.wire, V.copier, V.gater, V.all],
    spec: timeline(
      ['s', 'r'],
      ['q'],
      [
        [[0, 1], [0]],
        [[0, 0], [0]],
        [[1, 0], [1]],
        [[0, 0], [1]],
        [[0, 1], [0]],
        [[0, 0], [0]],
        [[1, 0], [1]],
        [[0, 0], [1]],
      ],
    ),
  },
  {
    name: 'Set and reset (+ qbar)',
    ins: ['s', 'r'],
    outs: ['q', 'qbar'],
    maxParts: 4,
    palettes: [V.wire, V.all],
    spec: timeline(
      ['s', 'r'],
      ['q', 'qbar'],
      [
        [[0, 1], [0, 1]],
        [[0, 0], [0, 1]],
        [[1, 0], [1, 0]],
        [[0, 0], [1, 0]],
        [[0, 1], [0, 1]],
        [[0, 0], [0, 1]],
        [[1, 0], [1, 0]],
        [[0, 0], [1, 0]],
      ],
    ),
  },
  {
    name: 'Gated (D latch)',
    ins: ['d', 'en'],
    outs: ['q'],
    maxParts: 6,
    palettes: [V.wire, V.copier, V.gater, V.all],
    spec: timeline(
      ['d', 'en'],
      ['q'],
      [
        // en high with d low first, so the latch starts defined
        [[0, 1], [0]],
        [[1, 1], [1]], // transparent: follows d
        [[1, 0], [1]], // door shut, holds
        [[0, 0], [1]], // d changes, output must not
        [[0, 1], [0]], // door open again, follows
        [[1, 0], [0]], // shut before d rises, holds low
        [[1, 1], [1]],
        [[0, 0], [1]],
      ],
    ),
  },
];

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

for (const c of cases) {
  console.log(`\n## ${c.name}   (${c.ins.join(',')} -> ${c.outs.join(',')})`);
  for (const p of c.palettes) {
    const t0 = Date.now();
    const r = synthesiseSeq({
      spec: c.spec,
      kinds: p.kinds,
      maxParts: c.maxParts,
      nodeBudget: 4_000_000,
    });
    const ms = Date.now() - t0;
    if (r.frontier.length === 0) {
      console.log(
        `  ${pad(p.label, 12)} none at <=${c.maxParts} parts   ` +
          `${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${r.states} states  ${ms}ms`,
      );
      continue;
    }
    const front = r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join('  ↔  ');
    const best = r.frontier[0];
    console.log(
      `  ${pad(p.label, 12)} ${pad(front, 22)} ` +
        `${hasFeedback(best.circuit) ? 'cyclic' : 'acyclic'}  ` +
        `${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${r.states} states  ${ms}ms`,
    );
    console.log(`      ${describeSeq(best.circuit, c.ins, c.outs)}`);
  }
}
