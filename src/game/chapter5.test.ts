import { describe, expect, it } from 'vitest';
import { LEVELS, LEVELS_BY_ID } from './levels';
import { LIBRARY, validateBlueprint } from './blueprints';
import { Level, createLevelWorld, outputNames, runTimeline } from './level';
import { board, bp, inv, path, run, sink, src } from '../sim/build';
import { W } from '../sim/kinds';
import { linkAllPins } from '../sim/draw';
import { readOutput, rebuild, reset, setInput, settle } from '../sim/world';
import { levelTargets } from '../model/personas';

/**
 * Chapter 5 — width, counting, and a display.
 *
 * The new risk here is the display. Its segments are the level's outputs, which
 * means a level can now be graded on something the player never places, so
 * these check that the grading really is reading the device and not a leftover
 * sink somewhere. The rest is the chapter-4 discipline: every reference is run,
 * every par is measured, and every input is proved to matter.
 */

const ch5 = LEVELS.filter((l) => l.chapter === 5);
const level = (id: string) => LEVELS_BY_ID.get(id)!;

function verify(l: Level) {
  const w = createLevelWorld(l, LIBRARY);
  l.reference(w);
  return runTimeline(w, l);
}

describe('chapter 5 is built and verified', () => {
  it('has the levels, in order', () => {
    expect(ch5.map((l) => l.id)).toEqual([
      'two-of-them',
      'only-when-told',
      'count-to-three',
      'one-of-four',
      'naught-and-one',
      'every-digit',
      'show-the-count',
    ]);
  });

  it.each(ch5.map((l) => [l.id, l] as const))('%s: the reference solves it', (_id, l) => {
    const v = verify(l);
    expect(v.oscillates).toBe(false);
    expect(v.passed).toBe(true);
  });

  it('scores the pars the prototypes predicted', () => {
    // measured, never typed: these come from running the references above
    expect(verify(level('two-of-them')).score).toMatchObject({ components: 26, ticks: 5 });
    expect(verify(level('only-when-told')).score).toMatchObject({ components: 19, ticks: 4 });
    expect(verify(level('count-to-three')).score).toMatchObject({ components: 28, ticks: 6 });
    expect(verify(level('one-of-four')).score).toMatchObject({ components: 12, ticks: 2 });
    expect(verify(level('naught-and-one')).score).toMatchObject({ components: 3, ticks: 1 });
    expect(verify(level('every-digit')).score).toMatchObject({ components: 8, ticks: 1 });
    expect(verify(level('show-the-count')).score).toMatchObject({ components: 49, ticks: 8 });
  });

  it('unlocks each block the chapter goes on to need', () => {
    expect(level('two-of-them').unlocks).toBe('reg2');
    expect(level('only-when-told').unlocks).toBe('regwe');
    expect(level('count-to-three').unlocks).toBe('count2');
    expect(level('one-of-four').unlocks).toBe('dec24');
    expect(level('every-digit').unlocks).toBe('digit4');
    for (const id of ['reg2', 'regwe', 'count2', 'dec24', 'digit4']) {
      expect(validateBlueprint(LIBRARY.get(id)!, LIBRARY)).toEqual([]);
    }
  });

  /**
   * The finale is only worth playing if its three tiles really are the three
   * things the chapter built. If a later edit made the counter or the decoder
   * cheaper, this number moves and the level's brief stops being true.
   */
  it('bills the finale for everything inside its three tiles', () => {
    const parts = (id: string) => {
      const w = board(20, 20, LIBRARY);
      bp(w, id, 2, 2);
      rebuild(w);
      return w.comps.filter((c) => c.instance >= 0).length;
    };
    expect(parts('count2')).toBe(28);
    expect(parts('dec24')).toBe(12);
    expect(parts('digit4')).toBe(9);
    expect(verify(level('show-the-count')).score.components).toBe(28 + 12 + 9);
  });
});

describe('the display is graded, not decorated', () => {
  const shown = ch5.filter((l) => l.display);

  it('makes the segments the level outputs', () => {
    expect(shown.map((l) => l.id)).toEqual(['naught-and-one', 'every-digit', 'show-the-count']);
    for (const l of shown) {
      expect(l.outputs).toEqual([]); // nothing to wire to but the display itself
      expect(outputNames(l)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
      expect(Object.keys(l.timeline.outputs).sort()).toEqual(outputNames(l).sort());
    }
  });

  it('reads every segment off the device, so a bare board lights nothing', () => {
    for (const l of shown) {
      const w = createLevelWorld(l, LIBRARY);
      const v = runTimeline(w, l);
      expect(v.passed).toBe(false);
      for (const s of v.steps) {
        expect(Object.values(s.actual).every((x) => x === false)).toBe(true);
      }
    }
  });

  it('keeps the board from being drawn on through the display', () => {
    const l = level('every-digit');
    const w = createLevelWorld(l, LIBRARY);
    const d = l.display!;
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(w.grid.locked[(d.y + dy) * l.grid.w + (d.x + dx)]).toBe(1);
      }
    }
  });
});

describe('the timelines pin down what they claim to teach', () => {
  /**
   * A decorative input is the failure mode that matters here: chapter 4 shipped
   * two specs where an input turned out to do nothing, and the search caught
   * both. This is the cheap version of that check, and it is exhaustive over
   * chapter 5 rather than clever — hold each input at each constant, and the
   * reference must stop working. If it does not, the level was never asking
   * about that input.
   */
  it.each(ch5.map((l) => [l.id, l] as const))('%s: every input changes the answer', (_id, l) => {
    for (const name of Object.keys(l.timeline.inputs)) {
      for (const stuck of [false, true]) {
        const pinned: Level = {
          ...l,
          timeline: {
            ...l.timeline,
            inputs: { ...l.timeline.inputs, [name]: l.timeline.inputs[name].map(() => stuck) },
          },
        };
        const w = createLevelWorld(l, LIBRARY);
        l.reference(w);
        expect({ name, stuck, passed: runTimeline(w, pinned).passed }).toEqual({
          name,
          stuck,
          passed: false,
        });
      }
    }
  });

  /**
   * Two of them must really be two. An earlier draft moved both bits on the
   * same edge from the same source and passed, because no step ever asked for
   * one bit to be high while the other was low.
   */
  it('Two of them keeps its bits apart', () => {
    const t = level('two-of-them').timeline;
    const differs = t.outputs.q0.some((v, i) => v !== null && v !== t.outputs.q1[i]);
    expect(differs).toBe(true);
  });

  /**
   * Only when told must ask for a HELD value across a rising edge, or a plain
   * flip-flop passes it and the write enable is decoration.
   */
  it('Only when told holds a value across an edge it should ignore', () => {
    const t = level('only-when-told').timeline;
    let held = false;
    for (let s = 1; s < t.steps; s++) {
      const rose = !t.inputs.clk[s - 1] && t.inputs.clk[s];
      const disabled = !t.inputs.we[s];
      const kept = t.outputs.q[s] !== null && t.outputs.q[s] === t.outputs.q[s - 1];
      const wouldHaveMoved = t.outputs.q[s] !== t.inputs.d[s];
      if (rose && disabled && kept && wouldHaveMoved) held = true;
    }
    expect(held).toBe(true);
  });

  /** The high bit must move at half the rate of the low one, or it is not counting. */
  it('Count to three really counts', () => {
    const t = level('count-to-three').timeline;
    const value = t.outputs.q0.map((v, i) => (v ? 1 : 0) + (t.outputs.q1[i] ? 2 : 0));
    expect(value).toEqual([0, 1, 1, 2, 2, 3, 3, 0, 0]);
  });

  /** Every digit must draw four DIFFERENT shapes, or one wire would do. */
  it('Every digit asks for four distinct shapes', () => {
    const t = level('every-digit').timeline;
    const shapes = new Set(
      Array.from({ length: t.steps }, (_, s) =>
        outputNames(level('every-digit'))
          .map((n) => (t.outputs[n][s] ? '1' : '0'))
          .join(''),
      ),
    );
    expect(shapes.size).toBe(4);
  });
});

describe('the counter wakes the same way wherever it is built', () => {
  /**
   * A counter has no load input, so like the divider it starts from wherever
   * the tick rule's tie-break puts it, and its whole trace is one flip away
   * from a different answer. That is only fair because a tile's insides are
   * emitted in the same order however it is placed. Two chapter-5 levels claim
   * an output at step zero on the strength of it, so if this ever stops being
   * true it should fail here rather than in someone's hands.
   */
  it('gives an identical count at three board offsets', () => {
    const traces = new Set<string>();
    for (const [dx, dy] of [
      [0, 0],
      [1, 2],
      [3, 1],
    ] as const) {
      const w = board(26, 18, LIBRARY);
      src(w, 'clk', dx, dy + 5);
      bp(w, 'dff', dx + 8, dy + 1);
      bp(w, 'dff', dx + 8, dy + 6);
      run(w, dx + 10, dy + 2, dx + 16, dy + 2);
      run(w, dx + 10, dy + 7, dx + 16, dy + 7);
      sink(w, 'q0', dx + 17, dy + 2);
      sink(w, 'q1', dx + 17, dy + 7);
      path(w, [dx + 12, dy + 2], [dx + 12, dy + 4], [dx + 4, dy + 4]);
      path(w, [dx + 1, dy + 5], [dx + 6, dy + 5], [dx + 6, dy + 3], [dx + 7, dy + 3]);
      inv(w, dx + 3, dy + 4, W);
      path(w, [dx + 2, dy + 4], [dx + 2, dy + 1], [dx + 7, dy + 1]);
      path(w, [dx + 2, dy + 4], [dx + 2, dy + 8], [dx + 7, dy + 8]);
      path(w, [dx + 12, dy + 7], [dx + 12, dy + 9], [dx + 6, dy + 9]);
      inv(w, dx + 5, dy + 9, W);
      path(w, [dx + 4, dy + 9], [dx + 4, dy + 6], [dx + 7, dy + 6]);
      linkAllPins(w);
      rebuild(w);
      reset(w);

      let out = '';
      for (let i = 0; i < 9; i++) {
        setInput(w, 'clk', i % 2 === 1);
        expect(settle(w, 64).settled).toBe(true);
        out += (readOutput(w, 'q0') ? 1 : 0) + (readOutput(w, 'q1') ? 2 : 0);
      }
      traces.add(out);
    }
    expect(traces.size).toBe(1);
    expect([...traces][0]).toBe('011223300');
  });

  /**
   * The same rule chapter 4 wrote down: a level may not claim an output value
   * before something has put the circuit into a state it chose. The two
   * counting levels are exempt, and the exemption is earned by the test above
   * rather than asserted here — delete that one and this becomes a lie.
   */
  const EXEMPT = new Set(['count-to-three', 'show-the-count']);

  it('any level that claims a value at step 0 does so from a defined state', () => {
    for (const l of ch5) {
      // a combinational level has no power-on state to be undefined about: its
      // step-0 answer is a function of its step-0 input and nothing else
      if (levelTargets(l).targets !== null) continue;
      const first = Object.values(l.timeline.outputs).map((o) => o[0]);
      if (first.every((v) => v === null)) continue;
      const anyInputHigh = Object.values(l.timeline.inputs).some((i) => i[0]);
      expect({ id: l.id, ok: anyInputHigh || EXEMPT.has(l.id) }).toEqual({ id: l.id, ok: true });
    }
  });
});
