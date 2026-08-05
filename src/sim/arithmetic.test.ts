import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../game/blueprints';
import { primitiveCount } from './blueprint';
import {
  board,
  harness,
  readWord,
  runVectors,
  wordBits,
  worstTicks,
} from './build';
import { componentCount } from './world';

describe('arithmetic', () => {
  it('half adder sums two bits', () => {
    const w = board(12, 8, LIBRARY);
    const { ins, outs } = harness(w, 'halfadder', 4, 1);
    expect(ins).toEqual(['a', 'b']);
    expect(outs).toEqual(['sum', 'carry']);

    const vectors = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ];
    const results = runVectors(w, ins, outs, vectors);
    const got = results.map((r) => [r.out[0], r.out[1]]);
    expect(got).toEqual([
      [false, false], // 0 + 0 = 0 carry 0
      [true, false], // 0 + 1 = 1 carry 0
      [true, false], // 1 + 0 = 1 carry 0
      [false, true], // 1 + 1 = 0 carry 1
    ]);
    expect(componentCount(w)).toBe(9); // XOR's six plus AND's three
  });

  it('full adder sums three bits', () => {
    const w = board(12, 10, LIBRARY);
    const { ins, outs } = harness(w, 'fulladder', 4, 1);
    expect(ins).toEqual(['a', 'b', 'cin']);

    const vectors: boolean[][] = [];
    for (let i = 0; i < 8; i++) {
      vectors.push([(i & 1) !== 0, (i & 2) !== 0, (i & 4) !== 0]);
    }
    const results = runVectors(w, ins, outs, vectors);

    results.forEach((r, i) => {
      const total = (i & 1 ? 1 : 0) + (i & 2 ? 1 : 0) + (i & 4 ? 1 : 0);
      expect({ i, sum: r.out[0], carry: r.out[1] }).toEqual({
        i,
        sum: (total & 1) === 1,
        carry: total >= 2,
      });
    });
    expect(componentCount(w)).toBe(18);
  });

  it('four-bit adder is correct across every input', () => {
    const w = board(11, 12, LIBRARY);
    const { ins, outs } = harness(w, 'adder4', 3, 1);
    expect(ins).toEqual(['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'cin']);
    expect(outs).toEqual(['s0', 's1', 's2', 's3', 'cout']);

    const vectors: boolean[][] = [];
    const expected: number[] = [];
    for (let cin = 0; cin < 2; cin++) {
      for (let a = 0; a < 16; a++) {
        for (let b = 0; b < 16; b++) {
          vectors.push([...wordBits(a, 4), ...wordBits(b, 4), cin === 1]);
          expected.push(a + b + cin);
        }
      }
    }

    const results = runVectors(w, ins, outs, vectors);
    const wrong = results
      .map((r, i) => {
        const got = readWord(r.out, 0, 4) + (r.out[4] ? 16 : 0);
        return got === expected[i] ? null : { i, got, want: expected[i] };
      })
      .filter(Boolean);

    expect(wrong).toEqual([]);
    expect(componentCount(w)).toBe(72);
    expect(primitiveCount(LIBRARY.get('adder4')!, LIBRARY)).toBe(72);
  });

  it('ripples: carry latency grows with how far the carry travels', () => {
    const w = board(11, 12, LIBRARY);
    const { ins, outs } = harness(w, 'adder4', 3, 1);

    // 0 + 0, then 1 + 0 — no carry leaves bit 0
    const shallow = runVectors(w, ins, outs, [
      [...wordBits(0, 4), ...wordBits(0, 4), false],
      [...wordBits(1, 4), ...wordBits(0, 4), false],
    ]);
    // 0 + 0, then 15 + 1 — the carry must cross all four stages
    const deep = runVectors(w, ins, outs, [
      [...wordBits(0, 4), ...wordBits(0, 4), false],
      [...wordBits(15, 4), ...wordBits(1, 4), false],
    ]);

    expect(readWord(deep[1].out, 0, 4)).toBe(0);
    expect(deep[1].out[4]).toBe(true); // carried out
    expect(worstTicks(deep.slice(1))).toBeGreaterThan(worstTicks(shallow.slice(1)));
  });

  it('every result settles — nothing in the adder oscillates', () => {
    const w = board(11, 12, LIBRARY);
    const { ins, outs } = harness(w, 'adder4', 3, 1);
    const vectors: boolean[][] = [];
    for (let a = 0; a < 16; a++) vectors.push([...wordBits(a, 4), ...wordBits(15 - a, 4), true]);
    for (const r of runVectors(w, ins, outs, vectors)) expect(r.settled).toBe(true);
  });
});
