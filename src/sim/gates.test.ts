import { describe, expect, it } from 'vitest';
import { LIBRARY, BLUEPRINTS, validateBlueprint } from '../game/blueprints';
import { primitiveCount } from './blueprint';
import {
  allVectors,
  board,
  bp,
  inv,
  path,
  run,
  runVectors,
  sink,
  src,
  truthTable,
  worstTicks,
} from './build';
import { componentCount } from './world';
import { S } from './kinds';

const bits = (s: string) => [...s].map((c) => c === '1');
const show = (rows: boolean[][]) => rows.map((r) => r.map((b) => (b ? 1 : 0)).join('')).join(' ');

/** a,b sweep in counting order: 00 01 10 11 */
const AB = allVectors(2);

describe('the gate ladder, built not given', () => {
  it('NOR is one inverter: join the inputs, then invert', () => {
    const w = board(10, 6);
    src(w, 'a', 0, 1);
    src(w, 'b', 0, 3);
    path(w, [1, 1], [3, 1], [3, 3], [1, 3]); // a and b onto one net
    inv(w, 4, 2);
    run(w, 5, 2, 6, 2);
    sink(w, 'q', 7, 2);

    expect(show(truthTable(w, ['a', 'b'], ['q']))).toBe('1 0 0 0');
    expect(componentCount(w)).toBe(1);
    expect(worstTicks(runVectors(w, ['a', 'b'], ['q'], AB))).toBe(1);
  });

  it('NAND is two inverters: invert first, then join', () => {
    const w = board(12, 6);
    src(w, 'a', 0, 1);
    run(w, 1, 1, 2, 1);
    inv(w, 3, 1);
    src(w, 'b', 0, 3);
    run(w, 1, 3, 2, 3);
    inv(w, 3, 3);
    path(w, [4, 1], [6, 1], [6, 3], [4, 3]); // the two inverter outputs onto one net
    sink(w, 'q', 7, 2);

    expect(show(truthTable(w, ['a', 'b'], ['q']))).toBe('1 1 1 0');
    expect(componentCount(w)).toBe(2);
    expect(worstTicks(runVectors(w, ['a', 'b'], ['q'], AB))).toBe(1);
  });

  it('AND is three inverters, and takes two ticks — De Morgan, in hardware', () => {
    const w = board(14, 6);
    src(w, 'a', 0, 1);
    run(w, 1, 1, 2, 1);
    inv(w, 3, 1);
    src(w, 'b', 0, 3);
    run(w, 1, 3, 2, 3);
    inv(w, 3, 3);
    path(w, [4, 1], [6, 1], [6, 3], [4, 3]);
    inv(w, 7, 2); // undo the inversion
    run(w, 8, 2, 9, 2);
    sink(w, 'q', 10, 2);

    expect(show(truthTable(w, ['a', 'b'], ['q']))).toBe('0 0 0 1');
    expect(componentCount(w)).toBe(3);
    expect(worstTicks(runVectors(w, ['a', 'b'], ['q'], AB))).toBe(2);
  });

  it('costs what the substrate says, not what CMOS intuition says', () => {
    // NOR cheapest, then NAND, then AND — the inverse of the usual ordering,
    // and the whole lesson of chapter 2.
    const counts = { nor2: 1, nand2: 2, and2: 3 };
    for (const [id, n] of Object.entries(counts)) {
      expect(primitiveCount(LIBRARY.get(id)!, LIBRARY)).toBe(n);
    }
  });
});

describe('fan-in consumes, fan-out does not', () => {
  it('a net driven by two sources is their OR, and they are no longer separable', () => {
    const w = board(10, 6);
    src(w, 'a', 0, 1);
    src(w, 'b', 0, 3);
    path(w, [1, 1], [3, 1], [3, 3], [1, 3]);
    sink(w, 'q', 4, 2); // taps the shared net directly

    expect(show(truthTable(w, ['a', 'b'], ['q']))).toBe('0 1 1 1');
  });

  it('one net can drive any number of readers for free', () => {
    const w = board(12, 10);
    src(w, 'a', 0, 3);
    run(w, 1, 3, 6, 3);
    inv(w, 7, 3);
    run(w, 8, 3, 9, 3);
    sink(w, 'q1', 10, 3);
    // a second reader tapping the same net from below, facing south
    path(w, [3, 3], [3, 4]);
    inv(w, 3, 5, S);
    run(w, 3, 6, 3, 7);
    sink(w, 'q2', 3, 8, S);

    const rows = truthTable(w, ['a'], ['q1', 'q2']);
    expect(show(rows)).toBe('11 00');
    expect(componentCount(w)).toBe(2);
    // the tap promoted the run to a junction, and it is all still one node
    expect(w.map.netA[3 + 3 * w.grid.w]).toBe(w.map.netA[1 + 3 * w.grid.w]);
  });
});

describe('the blueprint library', () => {
  it('is internally consistent', () => {
    for (const b of BLUEPRINTS) {
      expect({ id: b.id, problems: validateBlueprint(b, LIBRARY) }).toEqual({
        id: b.id,
        problems: [],
      });
    }
  });

  const gate = (id: string, expected: string, comps: number, ticks: number) => {
    it(`${id} matches its truth table at ${comps} components and ${ticks} ticks`, () => {
      const w = board(12, 8, LIBRARY);
      src(w, 'a', 0, 1);
      run(w, 1, 1, 3, 1);
      src(w, 'b', 0, 3);
      run(w, 1, 3, 3, 3);
      expect(bp(w, id, 4, 1)).toBe(true);
      run(w, 6, 2, 7, 2);
      sink(w, 'q', 8, 2);

      const results = runVectors(w, ['a', 'b'], ['q'], AB);
      expect(show(results.map((r) => r.out))).toBe(expected);
      expect(componentCount(w)).toBe(comps);
      expect(worstTicks(results)).toBe(ticks);
    });
  };

  gate('nand2', '1 1 1 0', 2, 1);
  gate('and2', '0 0 0 1', 3, 2);
  gate('xor2', '0 1 1 0', 6, 2);

  it('NOR merges the two host nets it faces, because that is what a NOR does here', () => {
    const w = board(12, 8, LIBRARY);
    src(w, 'a', 0, 1);
    run(w, 1, 1, 3, 1);
    src(w, 'b', 0, 3);
    run(w, 1, 3, 3, 3);
    expect(bp(w, 'nor2', 4, 1)).toBe(true);
    run(w, 6, 2, 7, 2);
    sink(w, 'q', 8, 2);

    const results = runVectors(w, ['a', 'b'], ['q'], AB);
    expect(show(results.map((r) => r.out))).toBe('1 0 0 0');
    // the two feeds are now one node
    const netA = w.map.netA[1 + 1 * w.grid.w];
    const netB = w.map.netA[1 + 3 * w.grid.w];
    expect(netA).toBe(netB);
  });

  it('places two instances without sharing their internals', () => {
    const w = board(16, 10, LIBRARY);
    src(w, 'a', 0, 1);
    run(w, 1, 1, 3, 1);
    src(w, 'b', 0, 3);
    run(w, 1, 3, 3, 3);
    expect(bp(w, 'and2', 4, 1)).toBe(true);
    run(w, 6, 2, 7, 2);
    sink(w, 'q1', 8, 2);

    src(w, 'c', 0, 5);
    run(w, 1, 5, 3, 5);
    src(w, 'd', 0, 7);
    run(w, 1, 7, 3, 7);
    expect(bp(w, 'and2', 4, 5)).toBe(true);
    run(w, 6, 6, 7, 6);
    sink(w, 'q2', 8, 6);

    const rows = truthTable(w, ['a', 'b', 'c', 'd'], ['q1', 'q2']);
    // q1 = a AND b, q2 = c AND d, independently
    expect(show(rows)).toBe('00 00 00 01 00 00 00 01 00 00 00 01 10 10 10 11');
    expect(componentCount(w)).toBe(6);
  });
});
