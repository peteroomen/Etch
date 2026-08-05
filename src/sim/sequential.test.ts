import { describe, expect, it } from 'vitest';
import { N, S } from './kinds';
import { board, inv, path, run, sink, src } from './build';
import { linkAllPins } from './draw';
import { readOutput, rebuild, reset, setInput, settle } from './world';

/**
 * A NOR latch, wired the way this substrate actually allows.
 *
 * Q = NOR(R, Qbar) and Qbar = NOR(S, Q), so the two feedback nets each carry
 * both a source and an inverter output — the merge IS the NOR's input stage.
 * Q is therefore read off the S net, which is valid whenever S is low, exactly
 * as an open-collector latch behaves.
 */
function srLatch() {
  const w = board(11, 8);
  src(w, 'S', 0, 1);
  run(w, 1, 1, 9, 1); // net B: S OR (output of inv1)
  src(w, 'R', 0, 5);
  run(w, 1, 5, 9, 5); // net A: R OR (output of inv2)

  // inv1 reads net A and drives net B, up the right-hand side
  path(w, [9, 5], [9, 4]);
  inv(w, 9, 3, N);
  path(w, [9, 2], [9, 1]);

  // inv2 reads net B and drives net A, down the left-hand side
  path(w, [1, 1], [1, 2]);
  inv(w, 1, 3, S);
  path(w, [1, 4], [1, 5]);

  sink(w, 'q', 5, 0, N);
  sink(w, 'qbar', 5, 6, S);

  linkAllPins(w);
  rebuild(w);
  reset(w);
  settle(w);
  return w;
}

function apply(w: ReturnType<typeof srLatch>, s: boolean, r: boolean) {
  setInput(w, 'S', s);
  setInput(w, 'R', r);
  const res = settle(w);
  return { q: readOutput(w, 'q'), qbar: readOutput(w, 'qbar'), ...res };
}

describe('the SR latch — feedback, and the first memory', () => {
  it('sets, holds, resets, and holds again', () => {
    const w = srLatch();

    expect(apply(w, true, false)).toMatchObject({ q: true, settled: true });
    expect(apply(w, false, false)).toMatchObject({ q: true, settled: true });
    expect(apply(w, false, true)).toMatchObject({ q: false, settled: true });
    expect(apply(w, false, false)).toMatchObject({ q: false, settled: true });
  });

  it('remembers across many idle ticks, not just one', () => {
    const w = srLatch();
    apply(w, true, false);
    apply(w, false, false);
    for (let i = 0; i < 50; i++) settle(w, 4);
    expect(readOutput(w, 'q')).toBe(true);
  });

  it('drives both outputs high in the illegal state', () => {
    const w = srLatch();
    const both = apply(w, true, true);
    expect(both.q).toBe(true);
    expect(both.qbar).toBe(true);
    expect(both.settled).toBe(true);
  });

  it('oscillates when both inputs are released at once, and says so', () => {
    const w = srLatch();
    apply(w, true, true);
    setInput(w, 'S', false);
    setInput(w, 'R', false);
    const res = settle(w, 64);
    // no stable state exists from a symmetric release — the sim reports that
    // rather than inventing an answer
    expect(res.settled).toBe(false);
  });

  it('is deterministic: the same sequence twice gives the same trace', () => {
    const trace = () => {
      const w = srLatch();
      const seq: string[] = [];
      for (const [s, r] of [
        [true, false],
        [false, false],
        [false, true],
        [false, false],
        [true, false],
      ] as const) {
        const res = apply(w, s, r);
        seq.push(`${res.q ? 1 : 0}${res.qbar ? 1 : 0}@${res.ticks}`);
      }
      return seq.join(' ');
    };
    expect(trace()).toBe(trace());
  });
});
