import { describe, expect, it } from 'vitest';
import { SeqCircuit, SeqSpec, describeSeq, hasFeedback, simulate, synthesiseSeq } from './seq';
import { synthesise } from './synth';
import { board, inv, path, run, sink, src } from '../sim/build';
import { N, S } from '../sim/kinds';
import { linkAllPins } from '../sim/draw';
import { readOutput, rebuild, reset, setInput, settle } from '../sim/world';

/**
 * The sequential search has to agree with two things: the combinational search,
 * on problems both can express, and the actual simulator, on problems only this
 * one can. Both are checked here, because a model that quietly disagrees with
 * the game is worse than no model.
 */

/** A combinational spec written as a full input sweep, so both searches see it. */
function sweepSpec(k: number, fn: (bits: boolean[]) => boolean[]): SeqSpec {
  const inputs: boolean[][] = [];
  for (let r = 0; r < 1 << k; r++) {
    const row: boolean[] = [];
    for (let i = 0; i < k; i++) row.push((r & (1 << i)) !== 0);
    inputs.push(row);
  }
  const nOut = fn(inputs[0]).length;
  const outputs: (boolean | null)[][] = Array.from({ length: nOut }, () => []);
  for (const row of inputs) {
    const got = fn(row);
    got.forEach((v, i) => outputs[i].push(v));
  }
  return { k, inputs, outputs };
}

/** The same function as a truth-table target, for the combinational search. */
function ttOf(k: number, fn: (bits: boolean[]) => boolean): number {
  let tt = 0;
  for (let r = 0; r < 1 << k; r++) {
    const row: boolean[] = [];
    for (let i = 0; i < k; i++) row.push((r & (1 << i)) !== 0);
    if (fn(row)) tt |= 1 << r;
  }
  return tt;
}

describe('the sequential search agrees with the combinational one', () => {
  it('costs NOR at one part, one tick — the same as synth', () => {
    const seq = synthesiseSeq({
      spec: sweepSpec(2, ([a, b]) => [!(a || b)]),
      kinds: ['not'],
      maxParts: 3,
    });
    const comb = synthesise({
      k: 2,
      targets: [ttOf(2, ([a, b]) => !(a || b))],
      kinds: ['not'],
      maxParts: 3,
    });
    expect(seq.frontier[0].parts).toBe(comb.frontier[0].parts);
    expect(seq.frontier[0].depth).toBe(comb.frontier[0].depth);
    expect(seq.frontier[0].parts).toBe(1);
  });

  it('costs NAND at two parts, one tick', () => {
    const r = synthesiseSeq({
      spec: sweepSpec(2, ([a, b]) => [!(a && b)]),
      kinds: ['not'],
      maxParts: 3,
    });
    expect(r.frontier[0]).toMatchObject({ parts: 2, depth: 1 });
  });

  it('costs AND at three parts, two ticks', () => {
    const r = synthesiseSeq({
      spec: sweepSpec(2, ([a, b]) => [a && b]),
      kinds: ['not'],
      maxParts: 4,
    });
    expect(r.frontier[0]).toMatchObject({ parts: 3, depth: 2 });
  });

  it('finds no feedback in a combinational answer', () => {
    const r = synthesiseSeq({
      spec: sweepSpec(2, ([a, b]) => [!(a || b)]),
      kinds: ['not'],
      maxParts: 2,
    });
    expect(hasFeedback(r.frontier[0].circuit)).toBe(false);
  });
});

describe('memory, which the combinational search cannot express at all', () => {
  /** Q latches high on the first pulse of A and never falls. */
  const holdSpec: SeqSpec = {
    k: 1,
    inputs: [[false], [true], [false], [false], [true], [false]],
    outputs: [[false, true, true, true, true, true]],
  };

  it('solves Hold, and the answer feeds back', () => {
    const r = synthesiseSeq({ spec: holdSpec, kinds: ['not', 'buf'], maxParts: 3 });
    expect(r.frontier.length).toBeGreaterThan(0);
    expect(hasFeedback(r.frontier[0].circuit)).toBe(true);
  });

  it('holds for one component when BUF is available', () => {
    const r = synthesiseSeq({ spec: holdSpec, kinds: ['not', 'buf'], maxParts: 3 });
    expect(r.frontier[0].parts).toBe(1);
  });

  /**
   * The SR latch. Step 0 asserts R deliberately: a symmetric power-on has no
   * stable state in a synchronous simulator, and the search agrees — it finds
   * nothing at all if the timeline opens with both inputs low.
   */
  const srSpec: SeqSpec = {
    k: 2, // s, r
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
  };

  it('solves the SR latch, and it is a cycle', () => {
    const r = synthesiseSeq({ spec: srSpec, kinds: ['not'], maxParts: 4 });
    expect(r.frontier.length).toBeGreaterThan(0);
    expect(hasFeedback(r.frontier[0].circuit)).toBe(true);
  });

  it('cannot solve set-and-reset without feedback, however many parts', () => {
    // the same spec is unreachable for any DAG, which is what makes it a memory
    const r = synthesiseSeq({ spec: srSpec, kinds: ['not'], maxParts: 4 });
    for (const s of r.frontier) expect(hasFeedback(s.circuit)).toBe(true);
  });
});

describe('oscillation is reported, not papered over', () => {
  it('calls a two-inverter ring unsettled under the old simultaneous rule', () => {
    // n0 -> NOT -> n1 -> NOT -> n0, with nothing to break the tie
    const sim = simulate(
      {
        k: 1,
        nets: 2,
        srcNet: [-1],
        parts: [
          { kind: 'not', ins: [0], out: 1 },
          { kind: 'not', ins: [1], out: 0 },
        ],
        outputs: [],
      },
      { k: 1, inputs: [[false]], outputs: [[null]] },
      undefined,
      'simultaneous',
    );
    expect(sim.settled).toBe(false);
  });

  it('resolves EVEN rings and still reports ODD ones', () => {
    // An even ring is a bistable: no simultaneous answer, but real stable
    // states exist, so the tie-break finds one. An odd ring has no stable state
    // under any ordering — it is an oscillator, and must keep saying so.
    const ring = (n: number): SeqCircuit => ({
      k: 1,
      nets: n,
      srcNet: [-1],
      parts: Array.from({ length: n }, (_, i) => ({
        kind: 'not' as const,
        ins: [(i + n - 1) % n],
        out: i,
      })),
      outputs: [0],
    });
    const cold: SeqSpec = { k: 1, inputs: [[false], [false]], outputs: [[null, null]] };
    expect(simulate(ring(2), cold).settled).toBe(true);
    expect(simulate(ring(4), cold).settled).toBe(true);
    expect(simulate(ring(3), cold).settled).toBe(false);
    expect(simulate(ring(5), cold).settled).toBe(false);
  });

  it('a single BUF reading itself settles, because it is not a ring', () => {
    const sim = simulate(
      {
        k: 1,
        nets: 1,
        srcNet: [0],
        parts: [{ kind: 'buf', ins: [0], out: 0 }],
        outputs: [],
      },
      { k: 1, inputs: [[false], [true], [false]], outputs: [[null, null, null]] },
    );
    expect(sim.settled).toBe(true);
    expect(sim.traces[0]).toEqual([false, true, true]);
  });
});

describe('the model and the game agree, tick for tick', () => {
  /**
   * The one test that matters. A model can agree with itself and still be
   * wrong about the game, and a par derived from a wrong model is worse than
   * no par at all.
   *
   * So: build the search's own SR latch witness — `n0 = s | NOT(n1);
   * n1 = r | NOT(n0)` — as an actual board, run the actual simulator over the
   * actual timeline, and require the same output trace AND the same tick count
   * the model predicted.
   */
  const srSpec: SeqSpec = {
    k: 2,
    inputs: [
      [false, true],
      [false, false],
      [true, false],
      [false, false],
      [false, true],
      [false, false],
    ],
    outputs: [[false, false, true, true, false, false]],
  };

  function realBoard() {
    const w = board(12, 7);
    src(w, 's', 0, 1);
    src(w, 'r', 0, 5);
    run(w, 1, 1, 10, 1); // net B: s merged with the upper inverter's output
    run(w, 1, 5, 9, 5); // net A: r merged with the lower inverter's output
    path(w, [9, 5], [9, 4]);
    inv(w, 9, 3, N); // reads A, drives B
    path(w, [9, 2], [9, 1]);
    path(w, [1, 1], [1, 2]);
    inv(w, 1, 3, S); // reads B, drives A
    path(w, [1, 4], [1, 5]);
    sink(w, 'q', 11, 1);
    linkAllPins(w);
    rebuild(w);
    reset(w);
    return w;
  }

  it('gives the same trace and the same ticks on a real board', () => {
    const model = simulate(
      {
        k: 2,
        nets: 2,
        srcNet: [0, 1], // s drives net 0, r drives net 1
        parts: [
          { kind: 'not', ins: [1], out: 0 },
          { kind: 'not', ins: [0], out: 1 },
        ],
        outputs: [0],
      },
      srSpec,
    );
    expect(model.settled).toBe(true);

    const w = realBoard();
    setInput(w, 's', srSpec.inputs[0][0]);
    setInput(w, 'r', srSpec.inputs[0][1]);
    settle(w, 256);

    const trace: boolean[] = [];
    let worst = 0;
    for (const [s, r] of srSpec.inputs) {
      setInput(w, 's', s);
      setInput(w, 'r', r);
      const res = settle(w, 256);
      expect(res.settled).toBe(true);
      worst = Math.max(worst, res.ticks);
      trace.push(readOutput(w, 'q'));
    }

    expect(trace).toEqual(model.traces[0]);
    expect(trace).toEqual(srSpec.outputs[0]);
    expect(worst).toBe(model.worst);
  });

  it('agrees that a symmetric release RESOLVES, on the board and in the model', () => {
    const both: SeqSpec = {
      k: 2,
      inputs: [
        [true, true],
        [false, false],
      ],
      outputs: [[null, null]],
    };
    const model = simulate(
      {
        k: 2,
        nets: 2,
        srcNet: [0, 1],
        parts: [
          { kind: 'not', ins: [1], out: 0 },
          { kind: 'not', ins: [0], out: 1 },
        ],
        outputs: [0],
      },
      both,
    );
    // Both now pick a state instead of ringing. They do NOT have to pick the
    // same side: the tie is broken by update order, and the model's order is
    // its part list while the game's is board scan order. That is a real limit
    // worth stating — the model can prove a latch HAS a power-on state, never
    // which one — and it is why no level may depend on the value a latch wakes
    // up holding. Every sequential timeline asserts a set or a reset first.
    expect(model.settled).toBe(true);

    const w = realBoard();
    setInput(w, 's', true);
    setInput(w, 'r', true);
    settle(w, 64);
    setInput(w, 's', false);
    setInput(w, 'r', false);
    expect(settle(w, 64).settled).toBe(true);
  });
});

describe('the witness reads as a netlist', () => {
  it('names the level own pins', () => {
    const r = synthesiseSeq({
      spec: sweepSpec(2, ([a, b]) => [!(a || b)]),
      kinds: ['not'],
      maxParts: 2,
    });
    const text = describeSeq(r.frontier[0].circuit, ['a', 'b'], ['q']);
    expect(text).toContain('a');
    expect(text).toContain('NOT(');
    expect(text).toContain('q=');
  });
});

/**
 * The update rule, and why it is `tiebreak`.
 *
 * Chapter 4 was blocked because a cross-coupled pair under simultaneous update
 * cannot break its own tie, and power-on is all-zero — perfectly symmetric.
 * Full ordered update fixes that and destroys the tick metric with it. These
 * tests pin both halves of the trade so the choice cannot be quietly undone.
 */
describe('the update rule', () => {
  const ring: SeqCircuit = {
    k: 1,
    nets: 2,
    srcNet: [-1],
    parts: [
      { kind: 'not', ins: [1], out: 0 },
      { kind: 'not', ins: [0], out: 1 },
    ],
    outputs: [0],
  };
  const cold: SeqSpec = { k: 1, inputs: [[false]], outputs: [[null]] };

  /** Four inverters in a row, laid out along the evaluation order. */
  const chain: SeqCircuit = {
    k: 1,
    nets: 5,
    srcNet: [0],
    parts: [
      { kind: 'not', ins: [0], out: 1 },
      { kind: 'not', ins: [1], out: 2 },
      { kind: 'not', ins: [2], out: 3 },
      { kind: 'not', ins: [3], out: 4 },
    ],
    outputs: [4],
  };
  /** The same circuit, laid out against it. */
  const reversed: SeqCircuit = { ...chain, parts: [...chain.parts].reverse() };
  const pulse: SeqSpec = { k: 1, inputs: [[false], [true], [false]], outputs: [[null, null, null]] };

  it('simultaneous update cannot break a symmetric tie', () => {
    expect(simulate(ring, cold, undefined, 'simultaneous').settled).toBe(false);
  });

  it('tiebreak resolves the ring', () => {
    expect(simulate(ring, cold, undefined, 'tiebreak').settled).toBe(true);
  });

  it('tiebreak leaves logic depth exactly as it was', () => {
    expect(simulate(chain, pulse, undefined, 'tiebreak').worst).toBe(4);
    expect(simulate(chain, pulse, undefined, 'simultaneous').worst).toBe(4);
  });

  it('and depth stays independent of layout, which is the whole point', () => {
    expect(simulate(reversed, pulse, undefined, 'tiebreak').worst).toBe(4);
    expect(simulate(chain, pulse, undefined, 'tiebreak').worst).toBe(
      simulate(reversed, pulse, undefined, 'tiebreak').worst,
    );
  });

  it('full ordered update would have billed that chain one tick, not four', () => {
    // the rejected option, recorded so the trade-off is not forgotten
    expect(simulate(chain, pulse, undefined, 'ordered').worst).toBe(1);
    expect(simulate(reversed, pulse, undefined, 'ordered').worst).toBe(4);
  });
});
