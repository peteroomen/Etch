import { describe, expect, it } from 'vitest';
import { E, Kind, N, S, W } from './kinds';
import { board, bp, inv, path, run, sink, src } from './build';
import { linkAllPins } from './draw';
import { componentCount, readOutput, rebuild, reset, setInput, settle } from './world';
import type { Blueprint } from './blueprint';
import { LIBRARY, validateBlueprint } from '../game/blueprints';

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

/**
 * A blueprint whose internals form a CYCLE, and whose S pin and Q pin are the
 * SAME internal net.
 *
 * Every blueprint shipped before chapter 4 is a DAG with one pin per net, so
 * neither property had ever been exercised. Both are load-bearing for memory:
 * the cycle IS the latch, and S sharing a net with Q is exactly why the latch
 * costs two inverters here instead of the textbook four.
 *
 * Flattening used to let the LAST pin on a shared internal net overwrite the
 * first, so an unwired q̄ silently disconnected the R input and the latch could
 * never be set. That is what these tests pin down.
 */
describe('blueprints that contain a cycle', () => {
  const srlatchBp: Blueprint = {
    id: 'test-srlatch',
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
    parts: [
      { kind: Kind.Inverter, inNets: [1], outNet: 0 },
      { kind: Kind.Inverter, inNets: [0], outNet: 1 },
    ],
  };

  const library = new Map(LIBRARY);
  library.set('test-srlatch', srlatchBp);

  /** S and R wired in, Q wired out, q̄ deliberately left unconnected. */
  function placed() {
    const w = board(16, 9, library);
    src(w, 'S', 0, 2);
    src(w, 'R', 0, 6);
    run(w, 1, 2, 5, 2);
    path(w, [1, 6], [5, 6], [5, 4]);
    expect(bp(w, 'test-srlatch', 6, 2)).toBe(true);
    run(w, 8, 2, 13, 2);
    sink(w, 'q', 14, 2);
    linkAllPins(w);
    rebuild(w);
    reset(w);
    return w;
  }

  it('validates as a well-formed blueprint', () => {
    expect(validateBlueprint(srlatchBp, library)).toEqual([]);
  });

  it('bills both inverters, hiding nothing inside the tile', () => {
    expect(componentCount(placed())).toBe(2);
  });

  it('sets, holds, resets and holds — through the tile', () => {
    const w = placed();
    setInput(w, 'S', false);
    setInput(w, 'R', true);
    settle(w, 256);

    const trace: number[] = [];
    let worst = 0;
    for (const [s, r] of [
      [false, true],
      [false, false],
      [true, false],
      [false, false],
      [false, true],
      [false, false],
      [true, false],
      [false, false],
    ] as const) {
      setInput(w, 'S', s);
      setInput(w, 'R', r);
      const res = settle(w, 256);
      expect(res.settled).toBe(true);
      worst = Math.max(worst, res.ticks);
      trace.push(readOutput(w, 'q') ? 1 : 0);
    }
    expect(trace).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(worst).toBe(1);
  });

  it('an unwired output pin does not disconnect the input sharing its net', () => {
    // q̄ is unconnected above; if it clobbered R's host net the latch would
    // never leave zero, which is precisely the bug this guards
    const w = placed();
    setInput(w, 'S', true);
    setInput(w, 'R', false);
    settle(w, 256);
    expect(readOutput(w, 'q')).toBe(true);
  });
});
