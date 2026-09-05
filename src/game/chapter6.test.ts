import { describe, expect, it } from 'vitest';
import { LEVELS, LEVELS_BY_ID } from './levels';
import { LIBRARY, validateBlueprint } from './blueprints';
import { Level, createLevelWorld, outputNames, runTimeline } from './level';
import { board, bp, harness } from '../sim/build';
import { Blueprint } from '../sim/blueprint';
import { E, Kind, W } from '../sim/kinds';
import { linkAllPins } from '../sim/draw';
import { componentCount, readOutput, rebuild, reset, setInput, settle } from '../sim/world';
import { levelTargets } from '../model/personas';

/**
 * Chapter 6 — decimal.
 *
 * The chapter's claim is that there are two ways to count to ten and neither
 * wins outright, so the tests measure the claim rather than repeating it: the
 * two counters are compared on both axes, and the numbers the briefs quote are
 * the numbers the references score. If a later edit makes one of them cheaper,
 * a brief becomes a lie and this suite is where that should surface.
 */

const ch6 = LEVELS.filter((l) => l.chapter === 6);
const level = (id: string) => LEVELS_BY_ID.get(id)!;

function verify(l: Level) {
  const w = createLevelWorld(l, LIBRARY);
  l.reference(w);
  return runTimeline(w, l);
}

/** Primitives inside a tile, which is what the tile is billed. */
function parts(id: string): number {
  const w = board(30, 30, LIBRARY);
  bp(w, id, 2, 2);
  rebuild(w);
  return w.comps.filter((c) => c.instance >= 0).length;
}

describe('chapter 6 is built and verified', () => {
  it('has the levels, in order', () => {
    expect(ch6.map((l) => l.id)).toEqual([
      'clear-it',
      'clear-on-the-edge',
      'decade',
      'pass-it-on',
      'round-and-round',
      'ten-in-a-ring',
    ]);
  });

  it.each(ch6.map((l) => [l.id, l] as const))('%s: the reference solves it', (_id, l) => {
    const v = verify(l);
    expect(v.oscillates).toBe(false);
    expect(v.passed).toBe(true);
  });

  it('scores the pars the prototypes predicted', () => {
    expect(verify(level('clear-it')).score).toMatchObject({ components: 8, ticks: 2 });
    expect(verify(level('clear-on-the-edge')).score).toMatchObject({ components: 17, ticks: 5 });
    expect(verify(level('decade')).score).toMatchObject({ components: 75, ticks: 12 });
    expect(verify(level('pass-it-on')).score).toMatchObject({ components: 68, ticks: 3 });
    expect(verify(level('round-and-round')).score).toMatchObject({ components: 68, ticks: 3 });
    expect(verify(level('ten-in-a-ring')).score).toMatchObject({ components: 170, ticks: 3 });
  });

  it('unlocks each block the chapter goes on to need', () => {
    expect(level('clear-it').unlocks).toBe('dlatchc');
    expect(level('clear-on-the-edge').unlocks).toBe('dffc');
    expect(level('decade').unlocks).toBe('count10');
    expect(level('pass-it-on').unlocks).toBe('shift4');
    for (const id of ['dlatchc', 'dffc', 'count10', 'shift4', 'ring4']) {
      expect(validateBlueprint(LIBRARY.get(id)!, LIBRARY)).toEqual([]);
    }
  });

  it('costs two components to add a clear, and no more', () => {
    expect(parts('dlatchc') - parts('dlatch')).toBe(2);
    expect(parts('dffc')).toBe(2 * parts('dlatchc') + 1);
  });
});

describe('the two ways of counting to ten are a trade, not an answer', () => {
  /**
   * The finale's brief says the ring is not cheaper and wins on ticks instead.
   * Both halves of that are measured here, because a brief that quotes numbers
   * has to be checked against them or it rots.
   */
  it('makes the ring dearer in parts and faster in ticks', () => {
    const binary = verify(level('decade')).score;
    const ring = verify(level('ten-in-a-ring')).score;
    expect(ring.components).toBeGreaterThan(binary.components);
    expect(ring.ticks).toBeLessThan(binary.ticks);
    // a decoder would be the binary route's missing cost, and it is not small
    expect(ring.components - binary.components).toBeLessThan(100);
  });

  /**
   * The finale's brief says a 4-to-10 decoder costs forty-six components. That
   * is a number in PLAYER-FACING copy, so it is built and measured here rather
   * than asserted — the same rule as par. With 10..15 unreachable, digits 8 and
   * 9 need only two literals each; the other eight need four.
   */
  it('costs forty-six components to decode four wires into ten', () => {
    const parts: { kind: Kind; inNets: number[]; outNet: number }[] = [];
    // per digit: [bit, wantedHigh] pairs. A NOR of the complements is the AND.
    const lines: number[][] = [
      [0, 0, 1, 0, 2, 0, 3, 0], [0, 1, 1, 0, 2, 0, 3, 0],
      [0, 0, 1, 1, 2, 0, 3, 0], [0, 1, 1, 1, 2, 0, 3, 0],
      [0, 0, 1, 0, 2, 1, 3, 0], [0, 1, 1, 0, 2, 1, 3, 0],
      [0, 0, 1, 1, 2, 1, 3, 0], [0, 1, 1, 1, 2, 1, 3, 0],
      [0, 0, 3, 1], [0, 1, 3, 1],
    ];
    let next = 14;
    lines.forEach((lits, d) => {
      const m = next++;
      for (let i = 0; i < lits.length; i += 2) {
        parts.push({
          kind: lits[i + 1] ? Kind.Inverter : Kind.Delay,
          inNets: [lits[i]],
          outNet: m,
        });
      }
      parts.push({ kind: Kind.Inverter, inNets: [m], outNet: 4 + d });
    });

    const dec: Blueprint = {
      id: 'dec410',
      label: 'D410',
      name: '4-to-10 decoder',
      w: 2,
      h: 11,
      nets: next,
      pins: [
        ...[0, 1, 2, 3].map((i) => ({
          name: `q${i}`, dx: 0, dy: i, dir: W, role: 'in' as const, net: i,
        })),
        ...Array.from({ length: 10 }, (_, d) => ({
          name: `n${d}`, dx: 1, dy: d, dir: E, role: 'out' as const, net: 4 + d,
        })),
      ],
      parts,
    };
    const lib = new Map([...LIBRARY, ['dec410', dec]]);
    expect(validateBlueprint(dec, lib)).toEqual([]);

    const w = board(34, 26, lib);
    const { ins, outs } = harness(w, 'dec410', 6, 6);
    linkAllPins(w);
    rebuild(w);
    reset(w);
    for (let v = 0; v < 10; v++) {
      ins.forEach((n, i) => setInput(w, n, ((v >> i) & 1) === 1));
      expect(settle(w, 256).settled).toBe(true);
      expect({ v, hot: outs.filter((n) => readOutput(w, n)) }).toEqual({ v, hot: [`n${v}`] });
    }
    expect(componentCount(w)).toBe(46);

    // and with it added the BINARY route is cheaper end to end, which is why
    // the brief points at ticks instead of parts
    const binary = verify(level('decade')).score.components + 46;
    expect(binary).toBeLessThan(verify(level('ten-in-a-ring')).score.components);
  });

  /**
   * The ripple is the reason. A ripple counter's depth grows with its stages;
   * a ring's does not, because every stage shares one clock.
   */
  it('keeps the ring flat as it grows and the ripple not', () => {
    expect(verify(level('round-and-round')).score.ticks).toBe(
      verify(level('ten-in-a-ring')).score.ticks,
    );
    expect(verify(level('decade')).score.ticks).toBeGreaterThan(
      verify(LEVELS_BY_ID.get('count-to-three')!).score.ticks,
    );
  });

  /** Ten stages, ten cathodes, and nothing in between. */
  it('drives the tube with no decoder at all', () => {
    const l = level('ten-in-a-ring');
    expect(outputNames(l)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const w = createLevelWorld(l, LIBRARY);
    l.reference(w);
    rebuild(w);
    // every component on that board is inside one of the four ring blocks
    expect(w.comps.filter((c) => c.instance < 0 && (c.kind === 4 || c.kind === 5)).length).toBe(0);
  });
});

describe('the timelines pin down what they claim to teach', () => {
  it.each(ch6.map((l) => [l.id, l] as const))('%s: every input changes the answer', (_id, l) => {
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
   * A clear that only worked with the door shut would be a reset, not a clear.
   * Both levels have to ask for one while the thing is being told otherwise.
   */
  it('Clear asks for a wipe against an open door and a high D', () => {
    const t = level('clear-it').timeline;
    let fought = false;
    for (let s = 0; s < t.steps; s++) {
      if (t.inputs.clr[s] && t.inputs.en[s] && t.inputs.d[s] && t.outputs.q[s] === false) {
        fought = true;
      }
    }
    expect(fought).toBe(true);
  });

  it('Clear on the edge asks for a wipe with no edge anywhere near it', () => {
    const t = level('clear-on-the-edge').timeline;
    let quiet = false;
    for (let s = 1; s < t.steps; s++) {
      const noRise = t.inputs.clk[s - 1] === t.inputs.clk[s];
      if (t.inputs.clr[s] && noRise && t.outputs.q[s] === false && t.outputs.q[s - 1] === true) {
        quiet = true;
      }
    }
    expect(quiet).toBe(true);
  });

  /** Nine has to be reached and eleven must never be. */
  it('Decade counts every digit and stops at nine', () => {
    const t = level('decade').timeline;
    const seen = new Set<number>();
    for (let s = 0; s < t.steps; s++) {
      let v = 0;
      ['q0', 'q1', 'q2', 'q3'].forEach((n, i) => {
        if (t.outputs[n][s]) v |= 1 << i;
      });
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  /**
   * Never more than one. A ring is only a counter because its bit is unique —
   * two bits going round is two counters interleaved, and would still satisfy
   * anything laxer than this.
   */
  it('Round and round never lets two outputs be high at once', () => {
    const t = level('round-and-round').timeline;
    let ever = 0;
    for (let s = 0; s < t.steps; s++) {
      const row = ['q0', 'q1', 'q2', 'q3'].map((n) => t.outputs[n][s]);
      if (row.some((v) => v === null)) continue;
      const hot = row.filter(Boolean).length;
      expect({ step: s, tooMany: hot > 1 }).toEqual({ step: s, tooMany: false });
      if (hot === 1) ever++;
    }
    expect(ever).toBeGreaterThan(6); // and it does go round, repeatedly
  });

  it('Ten in a ring lights every digit in turn, and never two', () => {
    const l = level('ten-in-a-ring');
    const t = l.timeline;
    const lit: number[] = [];
    for (let s = 3; s < t.steps; s++) {
      const row = outputNames(l).map((n) => t.outputs[n][s]);
      if (row.some((v) => v === null)) continue;
      const hot = outputNames(l).filter((n) => t.outputs[n][s]);
      expect({ step: s, tooMany: hot.length > 1 }).toEqual({ step: s, tooMany: false });
      if (hot.length === 0) {
        lit.push(-1); // wiped: the tube goes dark, which is also an answer
        continue;
      }
      const d = Number(hot[0]);
      if (lit[lit.length - 1] !== d) lit.push(d);
    }
    // every digit once round, then the wipe, then it starts over from zero
    expect(lit).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, -1, -1, 0, 1]);
  });
});

describe('no level depends on a value it cannot control', () => {
  /**
   * Nothing in this chapter needs the chapter-4 exemption, and that is the
   * point of having built a clear: every sequential level here begins by
   * wiping itself, so its first claimed output is a state it chose.
   */
  it('starts every sequential level from a state it put itself in', () => {
    for (const l of ch6) {
      if (levelTargets(l).targets !== null) continue;
      const first = Object.values(l.timeline.outputs).map((o) => o[0]);
      if (first.every((v) => v === null)) continue;
      const anyInputHigh = Object.values(l.timeline.inputs).some((i) => i[0]);
      expect({ id: l.id, ok: anyInputHigh }).toEqual({ id: l.id, ok: true });
    }
  });
});
