import { describe, expect, it } from 'vitest';
import { LEVELS, LEVELS_BY_ID } from './levels';
import { LIBRARY, validateBlueprint } from './blueprints';
import { createLevelWorld, runTimeline } from './level';
import { SeqSpec, synthesiseSeq } from '../model/seq';
import { Level } from './level';

/**
 * Chapter 4 — memory.
 *
 * Two things are checked here that the other suites cannot check. First that
 * every reference actually verifies, which is where par comes from. Second, and
 * more useful, that each level's TIMELINE really pins down the behaviour it
 * claims to teach: the search has already caught two chapter-4 specs where an
 * input turned out to be decorative, and a level that can be passed without
 * understanding it is worse than no level.
 */

const ch4 = LEVELS.filter((l) => l.chapter === 4);
const level = (id: string) => LEVELS_BY_ID.get(id)!;

/** A level's timeline in the shape the sequential search takes. */
function specOf(l: Level): SeqSpec {
  const t = l.timeline;
  const ins = Object.keys(t.inputs);
  const outs = Object.keys(t.outputs);
  return {
    k: ins.length,
    inputs: Array.from({ length: t.steps }, (_, s) => ins.map((n) => !!t.inputs[n][s])),
    outputs: outs.map((n) => Array.from({ length: t.steps }, (_, s) => t.outputs[n][s] ?? null)),
  };
}

function verify(l: Level) {
  const w = createLevelWorld(l, LIBRARY);
  l.reference(w);
  return runTimeline(w, l);
}

describe('chapter 4 is built and verified', () => {
  it('has the memory levels, in order', () => {
    expect(ch4.map((l) => l.id)).toEqual(['hold', 'set-reset', 'enable', 'gated', 'edge']);
  });

  it.each(ch4.map((l) => [l.id, l] as const))('%s: the reference solves it', (_id, l) => {
    const v = verify(l);
    expect(v.oscillates).toBe(false);
    expect(v.passed).toBe(true);
  });

  it('scores the pars the model predicted', () => {
    // measured, never typed: these come from running the references above
    expect(verify(level('hold')).score).toMatchObject({ components: 1, ticks: 0 });
    expect(verify(level('set-reset')).score).toMatchObject({ components: 2, ticks: 1 });
    expect(verify(level('enable')).score).toMatchObject({ components: 5, ticks: 2 });
    expect(verify(level('gated')).score).toMatchObject({ components: 6, ticks: 2 });
    expect(verify(level('edge')).score).toMatchObject({ components: 13, ticks: 5 });
  });

  it('unlocks each block the next level needs', () => {
    expect(level('set-reset').unlocks).toBe('srlatch');
    expect(level('gated').unlocks).toBe('dlatch');
    expect(level('edge').unlocks).toBe('dff');
    for (const id of ['srlatch', 'dlatch', 'dff']) {
      expect(validateBlueprint(LIBRARY.get(id)!, LIBRARY)).toEqual([]);
    }
  });
});

describe('the timelines pin down what they claim to teach', () => {
  /**
   * Hold must not be passable by a plain wire. If it were, the level would be
   * teaching nothing at all — and a wire is the first thing anyone tries.
   */
  it('Hold cannot be passed without a component', () => {
    const r = synthesiseSeq({ spec: specOf(level('hold')), kinds: ['not', 'buf'], maxParts: 0 });
    expect(r.frontier).toEqual([]);
  });

  /**
   * Set and reset must need BOTH inputs. The search caught a chapter-4 spec
   * once where S was decorative because no step distinguished it from EN.
   */
  it('Set and reset needs a real reset, not just a set', () => {
    const spec = specOf(level('set-reset'));
    // strip R by pinning it low; the level must then be unsolvable
    const noReset: SeqSpec = { ...spec, inputs: spec.inputs.map(([s]) => [s, false]) };
    const r = synthesiseSeq({ spec: noReset, kinds: ['not'], maxParts: 3 });
    expect(r.frontier).toEqual([]);
  });

  /**
   * Gated must need its enable. With EN held high the latch is transparent, so
   * a level that could still be satisfied would not be testing the door.
   */
  /**
   * Enable must need BOTH s and en. An earlier draft of this spec had a
   * two-part answer that ignored S entirely, because no step had EN high with
   * S low — the search found the cheat in a tenth of a second.
   */
  it('Enable needs both its set and its enable', () => {
    const spec = specOf(level('enable'));
    const ins = Object.keys(level('enable').timeline.inputs);
    const si = ins.indexOf('s');
    // pin S low: with the set input gone the level must become unsolvable
    const noSet: SeqSpec = {
      ...spec,
      inputs: spec.inputs.map((row) => row.map((v, i) => (i === si ? false : v))),
    };
    const r = synthesiseSeq({ spec: noSet, kinds: ['not'], maxParts: 4 });
    expect(r.frontier).toEqual([]);
  });

  it('Gated needs its enable to actually gate', () => {
    const spec = specOf(level('gated'));
    const alwaysOpen: SeqSpec = { ...spec, inputs: spec.inputs.map(([d]) => [d, true]) };
    const r = synthesiseSeq({ spec: alwaysOpen, kinds: ['not', 'buf'], maxParts: 3 });
    expect(r.frontier).toEqual([]);
  });

  /**
   * The one that matters most: Edge must be unpassable by a transparent latch.
   * Its timeline holds the clock HIGH across a change in D twice over, which a
   * transparent latch follows and an edge-triggered one ignores.
   */
  it('Edge cannot be passed by a single transparent latch', () => {
    const dlatch = LIBRARY.get('dlatch')!;
    const spec = specOf(level('edge'));
    // one D latch, wired every possible way, at its own billed cost
    const r = synthesiseSeq({
      spec,
      kinds: [],
      maxParts: 6,
      maxNets: 4,
      nodeBudget: 5_000_000,
      macros: [
        {
          id: 'dlatch',
          nets: dlatch.nets,
          pinNet: dlatch.pins.map((p) => p.net),
          pinRole: dlatch.pins.map((p) => p.role),
          parts: [
            { kind: 'not', ins: [0], out: 2 },
            { kind: 'not', ins: [1], out: 2 },
            { kind: 'not', ins: [2], out: 3 },
            { kind: 'not', ins: [4], out: 3 },
            { kind: 'not', ins: [3], out: 4 },
            { kind: 'buf', ins: [1], out: 4 },
          ],
          cost: 6,
        },
      ],
    });
    expect(r.frontier).toEqual([]);
    expect(r.exhaustive).toBe(true);
  });
});

describe('no level depends on a value it cannot control', () => {
  /**
   * A latch that is holding has no simultaneous answer, so the tick rule breaks
   * the tie by board order. That gives every latch a real power-on state and
   * never a predictable one — so a level asserting an output before it has been
   * set or reset would pass or fail depending on where the player put a gate.
   *
   * Hold is exempt: its reference is a BUFFER loop, which is not a ring at all.
   * Nothing drives the node until A does, and the pull-down holds it low.
   */
  it('any level that claims a value at step 0 does so from a defined state', () => {
    for (const l of ch4) {
      const first = Object.values(l.timeline.outputs).map((o) => o[0]);
      if (first.every((v) => v === null)) continue; // claims nothing: always safe
      const anyInputHigh = Object.values(l.timeline.inputs).some((i) => i[0]);
      const buffered = l.id === 'hold';
      expect(anyInputHigh || buffered).toBe(true);
    }
  });
});
