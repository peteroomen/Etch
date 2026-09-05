import { describe, expect, it } from 'vitest';
import { HI, LO, SAW_HI, SAW_LO, SAW_X, V_NAME, X, Z, driveBit, resolve } from './values';

describe('the four-state resolver', () => {
  it('floats a net with no drivers and no pull', () => {
    expect(resolve(0, Z)).toBe(Z);
  });

  it('lets the weak pull decide when nothing drives', () => {
    expect(resolve(0, LO)).toBe(LO);
    expect(resolve(0, HI)).toBe(HI);
  });

  it('lets any strong driver beat the pull', () => {
    expect(resolve(SAW_HI, LO)).toBe(HI);
    expect(resolve(SAW_LO, HI)).toBe(LO);
  });

  it('calls a strong 0 fighting a strong 1 a short', () => {
    expect(resolve(SAW_LO | SAW_HI, LO)).toBe(X);
  });

  it('propagates a driver that is already unknown', () => {
    expect(resolve(SAW_X, LO)).toBe(X);
    expect(resolve(SAW_X | SAW_HI, LO)).toBe(X);
  });

  it('drives nothing from Z, which is what makes tri-state work', () => {
    expect(driveBit(Z)).toBe(0);
    expect(driveBit(LO)).toBe(SAW_LO);
    expect(driveBit(HI)).toBe(SAW_HI);
    expect(driveBit(X)).toBe(SAW_X);
  });

  describe('tier 1, where nothing ever drives a strong low', () => {
    // Every driver pulls HIGH or lets go; each net has a weak pull-down.
    const wiredOr = (...drivers: (typeof HI | typeof Z)[]) =>
      resolve(drivers.reduce<number>((a, d) => a | driveBit(d), 0), LO);

    it('reads as OR across any number of drivers', () => {
      expect(wiredOr()).toBe(LO);
      expect(wiredOr(Z)).toBe(LO);
      expect(wiredOr(Z, Z, Z)).toBe(LO);
      expect(wiredOr(HI)).toBe(HI);
      expect(wiredOr(Z, HI)).toBe(HI);
      expect(wiredOr(HI, HI, Z)).toBe(HI);
    });

    it('cannot reach contention, so X never surfaces', () => {
      for (const a of [HI, Z] as const) {
        for (const b of [HI, Z] as const) {
          expect(wiredOr(a, b)).not.toBe(X);
        }
      }
    });
  });

  it('names every state for the inspect tool', () => {
    expect([Z, LO, HI, X].map((v) => V_NAME[v])).toEqual(['Z', '0', '1', 'X']);
  });
});
