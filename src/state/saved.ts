/**
 * Boards that outlive the session.
 *
 * Until now leaving a level threw the board away — you came back to an empty
 * grid and rebuilt from memory. Two things are kept per level now: whatever you
 * had last, restored automatically, and the board that scored your best, which
 * you can go back to after experimenting somewhere worse.
 *
 * Stored as plain JSON rather than the typed arrays the grid uses, because the
 * grid's arrays are a runtime detail and the save format should survive one of
 * them changing shape. Cells are joined into a string: on a 20x13 board that is
 * an array of 260 numbers, and the string form is a third of the JSON size.
 */

import { Placement, World, restore, snapshot } from '../sim/world';
import { Score } from '../game/level';

const KEY = 'etch.boards';
const VERSION = 1;

export interface SavedBoard {
  w: number;
  h: number;
  cells: string;
  owner: string;
  placements: Placement[];
  pinNames: [string, string][];
  switches: [string, number][];
}

interface Entry {
  current?: SavedBoard;
  best?: { score: Score; board: SavedBoard };
}

type Store = { version: number; levels: Record<string, Entry> };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: VERSION, levels: {} };
    const parsed = JSON.parse(raw) as Store;
    if (parsed.version !== VERSION) return { version: VERSION, levels: {} };
    return parsed;
  } catch {
    // a corrupt save must never stop the game from opening
    return { version: VERSION, levels: {} };
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // out of quota, or private mode: losing a save is not worth a crash
  }
}

export function serialise(world: World): SavedBoard {
  const snap = snapshot(world);
  return {
    w: world.grid.w,
    h: world.grid.h,
    cells: Array.from(snap.cells).join(','),
    owner: Array.from(snap.owner).join(','),
    placements: snap.placements,
    pinNames: snap.pinNames,
    switches: [...world.switches.entries()],
  };
}

/** False when the board does not fit — a level's grid may have been resized. */
export function deserialise(world: World, b: SavedBoard): boolean {
  if (b.w !== world.grid.w || b.h !== world.grid.h) return false;
  const cells = b.cells.split(',').map(Number);
  const owner = b.owner.split(',').map(Number);
  if (cells.length !== world.grid.cells.length) return false;
  restore(world, {
    cells: Uint16Array.from(cells),
    owner: Int32Array.from(owner),
    placements: b.placements,
    pinNames: b.pinNames,
  });
  world.switches = new Map(b.switches);
  return true;
}

export function saveCurrent(levelId: string, world: World): void {
  const s = read();
  const entry = s.levels[levelId] ?? {};
  entry.current = serialise(world);
  s.levels[levelId] = entry;
  write(s);
}

/** Keep the board that scored a personal best, so it can be returned to. */
export function saveBest(levelId: string, world: World, score: Score): void {
  const s = read();
  const entry = s.levels[levelId] ?? {};
  entry.best = { score, board: serialise(world) };
  s.levels[levelId] = entry;
  write(s);
}

export function loadCurrent(levelId: string): SavedBoard | null {
  return read().levels[levelId]?.current ?? null;
}

export function loadBest(levelId: string): { score: Score; board: SavedBoard } | null {
  return read().levels[levelId]?.best ?? null;
}

export function forgetAll(): void {
  write({ version: VERSION, levels: {} });
}
