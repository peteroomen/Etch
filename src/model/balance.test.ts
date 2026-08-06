import { describe, expect, it } from 'vitest';
import { LEVELS, LEVELS_BY_ID } from '../game/levels';
import { analyseLevel, levelTargets, PERSONAS } from './personas';
import { describe as show } from './synth';

/**
 * Balance assertions.
 *
 * These do not check that the game works — the other suites do that. They check
 * that it is TUNED: that par is reachable, that a level's new tool actually
 * saves something, and that the difficulty curve rises.
 *
 * Everything here is measured by exhaustive search over the real substrate, so
 * a failure is a statement about the design rather than about the code.
 */

const analyse = (id: string) => analyseLevel(LEVELS_BY_ID.get(id)!);
const searchable = LEVELS.filter((l) => levelTargets(l).targets !== null);

describe('what the model can and cannot see', () => {
  /**
   * The project has two searches and one tick rule. `synth.ts` enumerates
   * truth tables, which is fast and exhaustive and can only express a DAG;
   * `seq.ts` simulates the real timeline, which is slower and can express a
   * cycle. Which one applies is decided by the level, not by taste: a level
   * whose timeline is a full input sweep is combinational, and anything else
   * has state.
   *
   * This test is the boundary between them, written down. A combinational
   * level appearing in this list would mean a level silently lost its
   * exhaustive par; a sequential one missing from it would mean the
   * combinational search is being asked a question it cannot answer.
   */
  it('hands exactly the sequential levels over to the other search', () => {
    const skipped = LEVELS.filter((l) => levelTargets(l).targets === null).map((l) => l.id);
    expect(skipped).toEqual(['hold', 'set-reset', 'gated', 'edge']);
  });

  it('and every one of those is a chapter about memory', () => {
    const skipped = LEVELS.filter((l) => levelTargets(l).targets === null);
    for (const l of skipped) expect(l.chapter).toBe(4);
  });

  it('says plainly where the part budget ran out rather than claiming impossibility', () => {
    const beyond = searchable.map(analyseLevel).filter((a) => a.beyondBudget).map((a) => a.id);
    // The full adder needs more components than the search can enumerate. That
    // is a limit of the model, and it must never be read as "unsolvable".
    expect(beyond).toEqual(['full-adder']);
  });

  it('reaches its verdicts by exhaustion, not by running out of nodes', () => {
    for (const level of searchable) {
      const a = analyseLevel(level);
      const truncated = a.results.filter((r) => !r.exhaustive).map((r) => r.persona);
      expect({ id: a.id, truncated }).toEqual({ id: a.id, truncated: [] });
    }
  });
});

describe('par is reachable, with room to improve', () => {
  for (const level of searchable) {
    it(`${level.title}: par is at or above the true optimum`, () => {
      const a = analyseLevel(level);
      if (a.beyondBudget) return;
      // a par below the optimum would be unreachable, which is worse than none
      expect({ id: a.id, headroom: a.headroom }).toEqual({
        id: a.id,
        headroom: expect.any(Number),
      });
      expect(a.headroom).toBeGreaterThanOrEqual(0);
      // and a reference wildly off the optimum means a badly chosen par
      expect(a.headroom).toBeLessThanOrEqual(3);
    });
  }
});

describe('the tools a level teaches actually pay for themselves', () => {
  it('BUF and OR are cheaper than the two-inverter copy they replace', () => {
    // Copy and XOR are both solvable with inverters alone — a copy is two
    // inverters. The lesson is cost, not possibility.
    for (const id of ['copy', 'one-or-other']) {
      const a = analyse(id);
      expect({ id, saving: a.toolSaving }).toEqual({ id, saving: expect.any(Number) });
      expect(a.toolSaving).toBeGreaterThan(0);
    }
  });

  it('Copy costs the same whether you buy copies or gates', () => {
    const a = analyse('copy');
    const copier = a.results.find((r) => r.persona === 'copier')!;
    const gater = a.results.find((r) => r.persona === 'gater')!;
    expect(copier.solved && gater.solved).toBe(true);
    expect(copier.best!.parts).toBe(gater.best!.parts);
  });

  it('OR dominates BUF: anything a copy does, a gate does for the same price', () => {
    // OR(x, x) IS a buffer, so the gate can do everything the copy can and more.
    // Measured across every searchable level rather than argued from the shape
    // of the primitives. If this ever stops holding, the balance changed.
    const worse: string[] = [];
    for (const level of searchable) {
      const a = analyseLevel(level);
      const copier = a.results.find((r) => r.persona === 'copier');
      const gater = a.results.find((r) => r.persona === 'gater');
      if (!copier?.solved || !gater?.solved) continue;
      if (gater.best!.parts > copier.best!.parts) worse.push(a.id);
    }
    expect(worse).toEqual([]);
  });

  it('but they are not interchangeable everywhere — the half adder prefers the gate', () => {
    const a = analyse('half-adder');
    const copier = a.results.find((r) => r.persona === 'copier')!.best!;
    const gater = a.results.find((r) => r.persona === 'gater')!.best!;
    // if these were always equal, one of the two tools would be redundant
    expect(gater.parts).toBeLessThan(copier.parts);
  });

  it('chapter 1 asks for nothing beyond inverters', () => {
    for (const id of ['continuity', 'invert', 'either', 'neither', 'not-both', 'both']) {
      const a = analyse(id);
      expect({ id, saving: a.toolSaving }).toEqual({ id, saving: 0 });
    }
  });
});

describe('the difficulty curve rises', () => {
  it('chapter 2 costs strictly more as it goes', () => {
    const costs = ['neither', 'not-both', 'both'].map(
      (id) => analyse(id).results.find((r) => r.persona === 'optimiser')!.best!.parts,
    );
    expect(costs).toEqual([1, 2, 3]);
  });

  it('never jumps more than three components between consecutive levels', () => {
    const jumps: { from: string; to: string; jump: number }[] = [];
    for (let i = 1; i < searchable.length; i++) {
      const prev = analyseLevel(searchable[i - 1]);
      const cur = analyseLevel(searchable[i]);
      const a = prev.results.find((r) => r.persona === 'optimiser')?.best?.parts;
      const b = cur.results.find((r) => r.persona === 'optimiser')?.best?.parts;
      if (a === undefined || b === undefined) continue;
      if (b - a > 3) jumps.push({ from: prev.id, to: cur.id, jump: b - a });
    }
    expect(jumps).toEqual([]);
  });
});

describe('the three metrics earn their place', () => {
  it('at least one level has a genuine components-against-ticks trade-off', () => {
    const withTension = searchable
      .map(analyseLevel)
      .filter((a) => a.frontierSize > 1)
      .map((a) => a.id);
    expect(withTension.length).toBeGreaterThan(0);
  });

  it('the half adder is one of them', () => {
    // spend two more components to save a tick — the scoring model in miniature
    const a = analyse('half-adder');
    expect(a.frontierSize).toBeGreaterThan(1);
    const [cheap, fast] = a.results.find((r) => r.persona === 'optimiser')!.frontier;
    expect(cheap.parts).toBeLessThan(fast.parts);
    expect(cheap.depth).toBeGreaterThan(fast.depth);
  });
});

describe('witnesses', () => {
  it('produces a readable circuit for XOR', () => {
    const a = analyse('one-or-other');
    expect(a.witness).toBeTruthy();
    expect(show(a.witness!.circuit)).toMatch(/NOT|BUF|OR/);
  });

  it('reports every persona', () => {
    expect(analyse('both').results.map((r) => r.persona)).toEqual(PERSONAS.map((p) => p.id));
  });
});
