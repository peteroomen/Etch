/** Palette entries: the tools and components a level lets the player use. */

import { Kind } from '../sim/kinds';
import { LIBRARY } from './blueprints';

export type ToolId = 'wire' | 'cross' | 'junction' | 'erase' | 'inspect';

export interface PaletteItem {
  id: string;
  label: string;
  /** a drawing tool rather than a placeable thing */
  tool?: ToolId;
  kind?: Kind;
  blueprint?: string;
  w: number;
  h: number;
  hint: string;
}

const PRIMITIVES: Record<string, PaletteItem> = {
  wire: { id: 'wire', label: 'WIRE', tool: 'wire', w: 1, h: 1, hint: 'Drag to draw. Wires that cross do not join.' },
  cross: { id: 'cross', label: 'CROSS', tool: 'cross', w: 1, h: 1, hint: 'Two axes, kept separate.' },
  junction: { id: 'junction', label: 'JOIN', tool: 'junction', w: 1, h: 1, hint: 'Merges every wire it touches. Joining consumes.' },
  erase: { id: 'erase', label: 'ERASE', tool: 'erase', w: 1, h: 1, hint: 'Drag to remove.' },
  inspect: { id: 'inspect', label: 'PROBE', tool: 'inspect', w: 1, h: 1, hint: 'Tap a net to read its value and its drivers.' },
  not: { id: 'not', label: 'NOT', kind: Kind.Inverter, w: 1, h: 1, hint: 'Drives HIGH when its input is LOW. One tick.' },
  buf: { id: 'buf', label: 'BUF', kind: Kind.Delay, w: 1, h: 1, hint: 'An independent copy. One tick.' },
  or: {
    id: 'or',
    label: 'OR',
    kind: Kind.Or,
    w: 1,
    h: 1,
    hint: 'Reads both inputs instead of consuming them. One component, one tick.',
  },
  led: { id: 'led', label: 'LED', kind: Kind.Led, w: 1, h: 1, hint: 'Lights when its net is HIGH.' },
  switch: { id: 'switch', label: 'SW', kind: Kind.Switch, w: 1, h: 1, hint: 'Tap to toggle while running.' },
  clock: { id: 'clock', label: 'CLK', kind: Kind.Clock, w: 1, h: 1, hint: 'Alternates on its own.' },
};

export function paletteItem(id: string): PaletteItem | null {
  const p = PRIMITIVES[id];
  if (p) return p;
  const bp = LIBRARY.get(id);
  if (!bp) return null;
  return {
    id,
    label: bp.label,
    blueprint: id,
    w: bp.w,
    h: bp.h,
    hint: `${bp.name} — built, not given.`,
  };
}

/** Tools every level always offers, before its own palette. */
export const ALWAYS: string[] = ['wire', 'erase', 'inspect'];

/** Names that are components or tools rather than earned blueprints. */
export const BUILT_IN = ['wire', 'cross', 'junction', 'erase', 'inspect', 'not', 'buf', 'or', 'led', 'switch', 'clock'];

export function resolvePalette(levelPalette: string[]): PaletteItem[] {
  const ids = [...new Set([...ALWAYS, ...levelPalette])];
  return ids.map(paletteItem).filter((x): x is PaletteItem => x !== null);
}
