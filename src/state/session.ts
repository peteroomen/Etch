/**
 * The live board.
 *
 * The grid, its nets and its components live HERE, in a plain module
 * singleton — never in React state and never in the store. Putting a
 * few thousand cells behind a reducer would re-render the tree on every
 * tick and the game would run at fifteen frames a second on a phone.
 *
 * React learns that something changed through `rev`, which the render loop
 * polls. Nothing subscribes to the grid itself.
 */

import { Level, createLevelWorld } from '../game/level';
import { LIBRARY } from '../game/blueprints';
import { linkAllPins } from '../sim/draw';
import { Snapshot, World, createWorld, rebuild, reset, restore, snapshot } from '../sim/world';

const UNDO_DEPTH = 50;

export interface Session {
  world: World;
  level: Level | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  /** bumped whenever the board changes shape; the renderer polls it */
  rev: number;
}

export const session: Session = {
  world: createWorld(24, 14, LIBRARY),
  level: null,
  undoStack: [],
  redoStack: [],
  rev: 0,
};

export function touched(): void {
  session.rev++;
}

export function loadLevel(level: Level): void {
  session.world = createLevelWorld(level, LIBRARY);
  session.level = level;
  session.undoStack = [];
  session.redoStack = [];
  touched();
}

export function loadSandbox(w = 40, h = 24): void {
  session.world = createWorld(w, h, LIBRARY);
  session.level = null;
  session.undoStack = [];
  session.redoStack = [];
  touched();
}

/** Take an undo point. Call once at the start of a gesture, not per cell. */
export function beginEdit(): void {
  session.undoStack.push(snapshot(session.world));
  if (session.undoStack.length > UNDO_DEPTH) session.undoStack.shift();
  session.redoStack = [];
}

/**
 * Re-derive nets after an edit. Batched, so a whole drag costs one extraction.
 *
 * Pins are linked here rather than at verification time: a wire drawn up to a
 * pin should connect the moment you lift your finger, not once you press
 * VERIFY. Otherwise the board lies about what is joined.
 */
export function commitEdit(): void {
  linkAllPins(session.world);
  rebuild(session.world);
  reset(session.world);
  touched();
}

export function undo(): void {
  const s = session.undoStack.pop();
  if (!s) return;
  session.redoStack.push(snapshot(session.world));
  restore(session.world, s);
  reset(session.world);
  touched();
}

export function redo(): void {
  const s = session.redoStack.pop();
  if (!s) return;
  session.undoStack.push(snapshot(session.world));
  restore(session.world, s);
  reset(session.world);
  touched();
}

export function canUndo(): boolean {
  return session.undoStack.length > 0;
}
export function canRedo(): boolean {
  return session.redoStack.length > 0;
}
