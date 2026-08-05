import { describe, expect, it } from 'vitest';
import { describe as show, sourceTable, synthesise } from './synth';

const A = sourceTable(2, 0);
const B = sourceTable(2, 1);
const mask2 = 0b1111;

const NOR = ~(A | B) & mask2;
const NAND = ~(A & B) & mask2;
const AND = A & B;
const XOR = (A ^ B) & mask2;

const best = (targets: number[], kinds: ('not' | 'buf' | 'or')[], maxParts: number, k = 2) =>
  synthesise({ k, targets, kinds, maxParts });

describe('the superoptimiser agrees with the substrate', () => {
  it('finds NOR at one inverter — merge the inputs, then invert', () => {
    const r = best([NOR], ['not'], 4);
    expect(r.exhaustive).toBe(true);
    expect(r.frontier[0]).toMatchObject({ parts: 1, depth: 1 });
  });

  it('finds NAND at two, and AND at three', () => {
    expect(best([NAND], ['not'], 5).frontier[0]).toMatchObject({ parts: 2, depth: 1 });
    expect(best([AND], ['not'], 5).frontier[0]).toMatchObject({ parts: 3, depth: 2 });
  });

  it('confirms the cost ordering is NOR, NAND, AND — inverted from silicon', () => {
    const cost = (t: number) => best([t], ['not', 'buf', 'or'], 6).frontier[0].parts;
    expect(cost(NOR)).toBeLessThan(cost(NAND));
    expect(cost(NAND)).toBeLessThan(cost(AND));
  });

  it('builds XOR from inverters alone, but pays for it', () => {
    // The fan-in wall is a COST wall, not an impossibility. A copy still exists
    // without BUF — it is just two inverters back to back. Searched to
    // exhaustion rather than argued.
    const r = best([XOR], ['not'], 9);
    expect(r.exhaustive).toBe(true);
    expect(r.frontier[0]).toMatchObject({ parts: 8, depth: 3 });
  });

  it('gets XOR down to six once a cheap copy is available', () => {
    const withBuf = best([XOR], ['not', 'buf'], 8).frontier[0];
    const withOr = best([XOR], ['not', 'or'], 8).frontier[0];
    expect(withBuf).toMatchObject({ parts: 6, depth: 2 });
    // both routes cost the same here, so neither tool is redundant
    expect(withOr.parts).toBe(withBuf.parts);
  });

  it('reports a witness that reads as a circuit', () => {
    const r = best([AND], ['not'], 5);
    expect(show(r.frontier[0].circuit)).toContain('NOT');
  });
});
