/**
 * The four-state lattice every net in Etch resolves on.
 *
 * Tier-1 gameplay is pure boolean and never sees Z or X: the inverter drives
 * strong HI or nothing, and every net carries a weak pull-down. Wired-OR is
 * therefore not a special case — it is what `resolve` does when nothing can
 * pull a net low.
 *
 * The idle half of the lattice is what lets a transistor chapter be added
 * later without a rewrite. An NMOS device drives strong LO, contention
 * becomes reachable, and X appears as the short circuit.
 */

export type V = 0 | 1 | 2 | 3;

export const Z: V = 0; // floating — nothing drives this net and it has no pull
export const LO: V = 1;
export const HI: V = 2;
export const X: V = 3; // contention, or a value derived from one

export const V_NAME = ['Z', '0', '1', 'X'] as const;

/**
 * Driver accumulator bits. A net collects these from every component driving
 * it during the commit phase, then resolves once.
 */
export const SAW_LO = 1;
export const SAW_HI = 2;
export const SAW_X = 4;

/** What a driver at value `v` contributes to a net's accumulator. */
export function driveBit(v: V): number {
  switch (v) {
    case LO:
      return SAW_LO;
    case HI:
      return SAW_HI;
    case X:
      return SAW_X;
    default:
      return 0; // Z drives nothing — that is the whole point of tri-state
  }
}

/**
 * Resolve a net from its accumulated strong drivers and its weak pull.
 *
 * Strong drivers win over the pull. Two strong drivers disagreeing is a short,
 * and shorts are X. With no strong driver at all the pull decides, and with no
 * pull either the net floats.
 */
export function resolve(acc: number, pull: V): V {
  if (acc & SAW_X) return X;
  const lo = (acc & SAW_LO) !== 0;
  const hi = (acc & SAW_HI) !== 0;
  if (lo && hi) return X; // strong 0 fighting strong 1
  if (hi) return HI;
  if (lo) return LO;
  return pull;
}

/** True only for a definite logic 1. Z and X are not high. */
export function isHigh(v: V): boolean {
  return v === HI;
}

/** True when a value is not a usable boolean, so it must poison what reads it. */
export function isUnknown(v: V): boolean {
  return v === Z || v === X;
}

export function fromBool(b: boolean): V {
  return b ? HI : LO;
}
