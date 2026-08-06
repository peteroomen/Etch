import { describe, expect, it } from 'vitest';
import { shortPin } from './board';
import { LIBRARY } from '../game/blueprints';
import { LEVELS } from '../game/levels';

/**
 * Pin names have to survive being shrunk to a cell.
 *
 * Plain truncation turned "qbar" into "QBA", which reads as a signal of its
 * own — and on a latch, where Q and Q-BAR sit one above the other, that is
 * exactly the pair a player cannot afford to confuse.
 */
describe('pin labels stay readable at cell size', () => {
  it('never mangles q-bar into a different name', () => {
    expect(shortPin('qbar')).toBe('/Q');
    expect(shortPin('qbar')).not.toContain('QBA');
  });

  it('leaves short names alone, in upper case', () => {
    expect(shortPin('q')).toBe('Q');
    expect(shortPin('d')).toBe('D');
    expect(shortPin('en')).toBe('EN');
    expect(shortPin('clk')).toBe('CLK');
  });

  it('keeps every blueprint pin to three characters or fewer', () => {
    for (const bp of LIBRARY.values()) {
      for (const pin of bp.pins) {
        expect(shortPin(pin.name).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps every level pin to three characters or fewer', () => {
    for (const l of LEVELS) {
      for (const p of [...l.inputs, ...l.outputs]) {
        expect(shortPin(p.name).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('gives each pin on a blueprint a distinct label', () => {
    // two pins reading the same on the tile would be worse than no label
    for (const bp of LIBRARY.values()) {
      const labels = bp.pins.map((p) => shortPin(p.name));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
