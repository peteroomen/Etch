import { describe, expect, it } from 'vitest';
import { Kind, E, N, S, W } from './kinds';
import { at, cellKind, cellMask, idx } from './grid';
import { extractNets, netAtPin } from './nets';
import { bresenham, drawRun, linkPin } from './draw';
import { board, path, run } from './build';
import { World } from './world';

function netsOf(w: World) {
  return extractNets(w.grid);
}

describe('drawing', () => {
  it('interpolates a fast drag so no cells are skipped', () => {
    const pts = bresenham(0, 0, 4, 0);
    expect(pts).toEqual([0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })));
    // every step is orthogonal and adjacent — diagonal wire has no meaning here
    const diag = bresenham(0, 0, 3, 3);
    for (let i = 1; i < diag.length; i++) {
      const d = Math.abs(diag[i].x - diag[i - 1].x) + Math.abs(diag[i].y - diag[i - 1].y);
      expect(d).toBe(1);
    }
  });

  it('gives a straight run the masks of a straight run', () => {
    const w = board(8, 4);
    run(w, 1, 1, 4, 1);
    expect(cellMask(at(w.grid, 1, 1))).toBe(1 << E);
    expect(cellMask(at(w.grid, 2, 1))).toBe((1 << E) | (1 << W));
    expect(cellMask(at(w.grid, 4, 1))).toBe(1 << W);
  });

  it('gives a corner two bits, not four', () => {
    const w = board(8, 8);
    path(w, [1, 1], [4, 1], [4, 4]);
    expect(cellMask(at(w.grid, 4, 1))).toBe((1 << W) | (1 << S));
    expect(cellKind(at(w.grid, 4, 1))).toBe(Kind.Wire);
  });

  it('promotes a three-way to a junction, because ending a stroke on a wire means join', () => {
    const w = board(8, 8);
    run(w, 1, 2, 5, 2);
    run(w, 3, 0, 3, 2); // arrives at the middle of the first run
    expect(cellKind(at(w.grid, 3, 2))).toBe(Kind.Junction);
  });

  it('promotes a four-way to a crossover, because crossing mid-drag is the accident', () => {
    const w = board(8, 8);
    run(w, 1, 3, 5, 3);
    run(w, 3, 1, 3, 5);
    expect(cellKind(at(w.grid, 3, 3))).toBe(Kind.Cross);
  });

  it('steps over a component rather than drawing on it', () => {
    const w = board(8, 4);
    w.grid.cells[idx(w.grid, 3, 1)] = Kind.Inverter | (E << 6);
    drawRun(w, 1, 1, 5, 1);
    expect(cellKind(at(w.grid, 3, 1))).toBe(Kind.Inverter);
    // but the wire either side still points at it
    expect(cellMask(at(w.grid, 2, 1)) & (1 << E)).toBeTruthy();
    expect(cellMask(at(w.grid, 4, 1)) & (1 << W)).toBeTruthy();
  });
});

describe('net extraction', () => {
  it('makes one net of a connected run', () => {
    const w = board(8, 4);
    run(w, 1, 1, 5, 1);
    const nets = netsOf(w);
    expect(nets.count).toBe(1);
    for (let x = 1; x <= 5; x++) expect(nets.netA[idx(w.grid, x, 1)]).toBe(0);
  });

  it('follows a bend', () => {
    const w = board(8, 8);
    path(w, [1, 1], [4, 1], [4, 5]);
    const nets = netsOf(w);
    expect(nets.count).toBe(1);
    expect(nets.netA[idx(w.grid, 1, 1)]).toBe(nets.netA[idx(w.grid, 4, 5)]);
  });

  it('keeps two runs that merely touch apart', () => {
    const w = board(8, 8);
    run(w, 1, 1, 4, 1);
    run(w, 1, 2, 4, 2); // parallel, adjacent, never facing each other
    const nets = netsOf(w);
    expect(nets.count).toBe(2);
    expect(nets.netA[idx(w.grid, 2, 1)]).not.toBe(nets.netA[idx(w.grid, 2, 2)]);
  });

  it('keeps a crossover’s two axes disjoint', () => {
    const w = board(9, 9);
    run(w, 1, 4, 7, 4);
    run(w, 4, 1, 4, 7);
    expect(cellKind(at(w.grid, 4, 4))).toBe(Kind.Cross);
    const nets = netsOf(w);
    expect(nets.count).toBe(2);
    const horiz = nets.netA[idx(w.grid, 1, 4)];
    const vert = nets.netA[idx(w.grid, 4, 1)];
    expect(horiz).not.toBe(vert);
    // the crossover cell carries both, one per axis
    const cellH = nets.netA[idx(w.grid, 4, 4)];
    const cellV = nets.netB[idx(w.grid, 4, 4)];
    expect(new Set([cellH, cellV])).toEqual(new Set([horiz, vert]));
  });

  it('merges everything a junction touches', () => {
    const w = board(9, 9);
    run(w, 1, 4, 7, 4);
    run(w, 4, 1, 4, 4);
    expect(cellKind(at(w.grid, 4, 4))).toBe(Kind.Junction);
    expect(netsOf(w).count).toBe(1);
  });

  it('merges all four ways through a junction placed by hand', () => {
    const w = board(9, 9);
    run(w, 1, 4, 7, 4);
    run(w, 4, 1, 4, 7);
    // replace the crossover with a junction: now the axes are one node
    w.grid.cells[idx(w.grid, 4, 4)] = Kind.Junction | (E << 6);
    expect(netsOf(w).count).toBe(1);
  });

  it('reaches a wire only when the wire faces back', () => {
    const w = board(8, 4);
    run(w, 2, 1, 5, 1);
    // (2,1) is the start of the run, so it has an east bit and no west bit:
    // a pin beside it is not connected until something points the wire back.
    expect(netAtPin(w.grid, netsOf(w), 1, 1, E)).toBe(-1);
    // a pin facing a cell that does not face back reaches nothing
    expect(netAtPin(w.grid, netsOf(w), 3, 0, S)).toBe(-1);
    // a pin facing off the board reaches nothing
    expect(netAtPin(w.grid, netsOf(w), 0, 0, W)).toBe(-1);
  });

  it('reaches it once linkPin points the wire back', () => {
    const w = board(8, 4);
    run(w, 2, 1, 5, 1);
    linkPin(w, 1, 1, E);
    expect(cellMask(at(w.grid, 2, 1)) & (1 << W)).toBeTruthy();
    expect(netAtPin(w.grid, netsOf(w), 1, 1, E)).toBe(0);
  });

  it('promotes to a junction when linking taps the middle of a run', () => {
    const w = board(8, 8);
    run(w, 1, 3, 6, 3);
    // a component below the run, reaching up into it
    linkPin(w, 3, 4, N);
    expect(cellKind(at(w.grid, 3, 3))).toBe(Kind.Junction);
    expect(netAtPin(w.grid, netsOf(w), 3, 4, N)).toBe(0);
  });

  it('binds a pin to the correct axis of a crossover', () => {
    const w = board(9, 9);
    run(w, 1, 4, 7, 4);
    run(w, 4, 1, 4, 7);
    const nets = netsOf(w);
    const horiz = nets.netA[idx(w.grid, 1, 4)];
    const vert = nets.netA[idx(w.grid, 4, 1)];
    // approaching the crossover from the west lands on the east-west net
    expect(netAtPin(w.grid, nets, 3, 4, E)).toBe(horiz);
    // approaching from the north lands on the north-south net
    expect(netAtPin(w.grid, nets, 4, 3, S)).toBe(vert);
  });

  it('numbers nets densely', () => {
    const w = board(12, 12);
    run(w, 0, 0, 3, 0);
    run(w, 0, 3, 3, 3);
    run(w, 0, 6, 3, 6);
    const nets = netsOf(w);
    expect(nets.count).toBe(3);
    expect(new Set([0, 1, 2])).toEqual(
      new Set([
        nets.netA[idx(w.grid, 0, 0)],
        nets.netA[idx(w.grid, 0, 3)],
        nets.netA[idx(w.grid, 0, 6)],
      ]),
    );
  });
});
