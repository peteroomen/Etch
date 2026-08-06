/**
 * The fair test of ordered update: re-SEARCH under each rule.
 *
 * Judging a mode by a circuit found under a different mode is not a test of the
 * mode. Each rule gets its own exhaustive search for a D latch that must power
 * on with the door shut — the property that composition needs.
 */
import { PartKind } from '../src/model/synth';
import { SeqSpec, UpdateMode, describeSeq, synthesiseSeq } from '../src/model/seq';

const spec: SeqSpec = {
  k: 2,
  inputs: [
    [false, false], // powered on, door shut: must already be defined
    [true, false], // d rises behind a shut door: still zero
    [true, true], // door opens, follows
    [true, false], // shut, holds
    [false, false], // d falls behind the door: holds
    [false, true], // opens, follows down
    [true, false], // rises behind the door: holds low
    [true, true], // opens, follows up
  ],
  outputs: [[false, false, true, true, true, false, false, true]],
};

for (const mode of ['simultaneous', 'ordered', 'seeded'] as UpdateMode[]) {
  for (const [label, kinds] of [
    ['NOT only', ['not']],
    ['NOT+BUF', ['not', 'buf']],
  ] as [string, PartKind[]][]) {
    const t0 = Date.now();
    const r = synthesiseSeq({ spec, kinds, maxParts: 6, nodeBudget: 40_000_000, mode });
    console.log(
      `${mode.padEnd(13)} ${label.padEnd(9)} ` +
        `${r.frontier.map((s) => `${s.parts}p/${s.depth}t`).join(' ↔ ') || 'none at <=6'}` +
        `  ${r.exhaustive ? 'exhaustive' : 'TRUNCATED'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    if (r.frontier[0]) console.log(`                        ${describeSeq(r.frontier[0].circuit, ['d', 'en'], ['q'])}`);
  }
}
