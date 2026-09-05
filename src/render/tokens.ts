/**
 * The board's palette, in one place so the art direction is one file.
 *
 * Amber is the signal colour throughout, and it is deliberate: it is the nixie
 * colour, so the first lit wire in level 1 and the digits on the endgame
 * display are the same light. Cyan is quarantined to the interface — nothing
 * in the chrome may ever read as a live net.
 */

export const T = {
  board: '#0a0c10',
  grid: '#141922',
  gridStrong: '#1b222d',

  traceOff: '#2b3340',
  traceOn: '#ffb454',
  traceGlow: 'rgba(255,180,84,0.55)',
  traceUnknown: '#e05252',
  traceFloat: '#3a3550',

  body: '#1a2029',
  bodyEdge: '#39414f',
  bodyLit: '#241f18',
  glyph: '#8b96a8',
  glyphOn: '#ffc978',

  pin: '#151b24',
  pinEdge: '#3a4250',

  ledOff: '#332b22',
  ledOn: '#ffd39a',

  locked: 'rgba(90,102,122,0.14)',
  accent: '#4ec9e0',
  accentSoft: 'rgba(78,201,224,0.18)',
  ghost: 'rgba(255,180,84,0.30)',
  bad: '#e05252',

  text: '#cfd6e2',
  textDim: '#77828f',
} as const;

/** Trace thickness as a fraction of the cell — wide enough to read at 24px. */
export const TRACE = 0.34;

/** How far a component body is inset from its cell, leaving room for the trace. */
export const BODY_INSET = 0.13;

export const MIN_CELL = 14;
export const MAX_CELL = 72;
export const DEFAULT_CELL = 30;
