import { describe, expect, it } from 'vitest';
import { LIBRARY } from './blueprints';
import { LEVELS } from './levels';
import { BUILT_IN } from './palette';
import { createLevelWorld, inputNames, outputNames, runTimeline, verifyLevel } from './level';

/**
 * A level that ships unsolvable is the worst bug available here, so every
 * reference solution is played headlessly and its par is measured from the
 * result. Nothing about difficulty is asserted by hand.
 */
describe('every level is solvable, and par comes from the solution', () => {
  for (const level of LEVELS) {
    describe(`${level.chapter}.${level.title}`, () => {
      it('is solved by its reference', () => {
        const v = verifyLevel(level, LIBRARY);
        const failed = v.steps.filter((s) => !s.ok);
        expect({ id: level.id, failed: failed.map((s) => ({ step: s.step, got: s.actual, want: s.expected })) })
          .toEqual({ id: level.id, failed: [] });
        expect(v.oscillates).toBe(false);
      });

      it('has a par worth beating', () => {
        const v = verifyLevel(level, LIBRARY);
        expect(v.score.area).toBeGreaterThan(0);
        expect(v.score.components).toBeGreaterThanOrEqual(0);
        expect(v.score.ticks).toBeGreaterThanOrEqual(0);
      });

      it('declares a timeline that actually exercises its inputs', () => {
        const ins = inputNames(level);
        const outs = outputNames(level);
        expect(Object.keys(level.timeline.inputs).sort()).toEqual([...ins].sort());
        expect(Object.keys(level.timeline.outputs).sort()).toEqual([...outs].sort());
        for (const n of ins) {
          expect(level.timeline.inputs[n]).toHaveLength(level.timeline.steps);
        }
        for (const n of outs) {
          expect(level.timeline.outputs[n]).toHaveLength(level.timeline.steps);
        }
      });

      it('is not already solved by an empty board', () => {
        const w = createLevelWorld(level, LIBRARY);
        const v = runTimeline(w, level);
        expect(v.passed).toBe(false);
      });

      it('fits its reference inside the grid it declares', () => {
        const w = createLevelWorld(level, LIBRARY);
        level.reference(w);
        expect(w.grid.cells.length).toBe(level.grid.w * level.grid.h);
      });
    });
  }

  it('unlocks only blueprints that exist', () => {
    for (const level of LEVELS) {
      if (level.unlocks) expect(LIBRARY.has(level.unlocks)).toBe(true);
    }
  });

  it('never offers a palette entry the player has not been given', () => {
    const granted = new Set<string>();
    for (const level of LEVELS) {
      for (const item of level.palette) {
        const isTool = BUILT_IN.includes(item);
        expect({ level: level.id, item, ok: isTool || granted.has(item) }).toEqual({
          level: level.id,
          item,
          ok: true,
        });
      }
      if (level.unlocks) granted.add(level.unlocks);
    }
  });
});

describe('scoring', () => {
  it('reports three metrics that a player can trade against each other', () => {
    const v = verifyLevel(LEVELS.find((l) => l.id === 'both')!, LIBRARY);
    expect(v.score.components).toBe(3); // De Morgan's three inverters
    expect(v.score.ticks).toBe(2); // two levels of logic
    expect(v.score.area).toBeGreaterThan(v.score.components);
  });

  it('charges NOR less than NAND, and NAND less than AND', () => {
    const cost = (id: string) => verifyLevel(LEVELS.find((l) => l.id === id)!, LIBRARY).score.components;
    expect(cost('neither')).toBeLessThan(cost('not-both'));
    expect(cost('not-both')).toBeLessThan(cost('both'));
  });
});
