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
import { deserialise, loadCurrent, saveCurrent } from './saved';
import {
  Snapshot,
  World,
  createWorld,
  rebuild,
  removeAt,
  reset,
  restore,
  setInput,
  settle,
  snapshot,
} from '../sim/world';

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

const listeners = new Set<() => void>();

/**
 * React cannot see the board, by design — but it does need to know when the
 * undo history changed, or the undo and redo buttons show stale state forever.
 * This is the one thread between the two worlds, and it carries a number.
 */
export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function sessionRev(): number {
  return session.rev;
}

export function touched(): void {
  session.rev++;
  for (const fn of listeners) fn();
}

export function loadLevel(level: Level): void {
  session.world = createLevelWorld(level, LIBRARY);
  session.level = level;
  session.undoStack = [];
  session.redoStack = [];
  // whatever you had here last, rather than an empty grid you have to rebuild
  const saved = loadCurrent(level.id);
  if (saved) deserialiseInto(saved);
  touched();
}

export function loadSandbox(w = 40, h = 24): void {
  session.world = createWorld(w, h, LIBRARY);
  const saved = loadCurrent(SANDBOX_ID);
  if (saved) deserialise(session.world, saved);
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
  touched(); // a fresh edit invalidates redo, and the button has to notice
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
  persist();
  touched();
}

/** Keep the board for next time. Once per gesture, not once per cell. */
function persist(): void {
  saveCurrent(session.level ? session.level.id : SANDBOX_ID, session.world);
}

/** The sandbox has no level, but it has a board worth keeping. */
export const SANDBOX_ID = '__sandbox';

function deserialiseInto(board: Parameters<typeof deserialise>[1]): void {
  deserialise(session.world, board);
}

/**
 * Put the board into one step of a level's timeline.
 *
 * Verification used to run the whole thing instantly and then reset, so the
 * only thing you ever saw was a verdict. Playback drives the same inputs at
 * the player's tick rate, so the circuit is watched rather than reported on.
 */
export function applyStep(level: Level, step: number): void {
  const t = level.timeline;
  const i = ((step % t.steps) + t.steps) % t.steps;
  for (const name of Object.keys(t.inputs)) {
    setInput(session.world, name, !!t.inputs[name][i]);
  }
  touched();
}

/** Jump straight to the settled result of a step, for the STEP button. */
export function settleStep(level: Level, step: number): void {
  applyStep(level, step);
  settle(session.world, 256);
  touched();
}

/**
 * Wipe everything the player put down, keeping the level's own pins.
 * Takes an undo point first, so it is a mistake you can walk back.
 */
export function clearBoard(): void {
  beginEdit();
  const g = session.world.grid;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) removeAt(session.world, x, y);
  }
  session.world.placements = [];
  session.world.switches.clear();
  commitEdit();
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
