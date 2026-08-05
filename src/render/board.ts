/**
 * Canvas renderer for the board.
 *
 * Traces run edge to edge and join square at the cell centre, so a straight run
 * draws as one unbroken bar and a component sits flush against the wire that
 * feeds it. No detached stubs — a trace either reaches the thing or it does
 * not, and the picture should never suggest otherwise.
 *
 * Only visible cells are touched, so cost is O(what is on screen) rather than
 * O(board).
 */

import { Dir, E, Kind, N, S, W, kindDef, worldPins } from '../sim/kinds';
import { at, cellKind, cellMask, cellRot, idx, inBounds } from '../sim/grid';
import { HI, LO, V, X, Z } from '../sim/values';
import { World } from '../sim/world';
import { BODY_INSET, T, TRACE } from './tokens';

export interface Viewport {
  /** screen pixels of the board's top-left corner */
  ox: number;
  oy: number;
  /** screen pixels per cell */
  cell: number;
}

export interface RenderOptions {
  /** cell under the pointer, highlighted */
  hover?: { x: number; y: number } | null;
  /** footprint preview for the currently held component */
  ghost?: { x: number; y: number; w: number; h: number; ok: boolean } | null;
  /** net id to highlight, from the inspect tool */
  highlightNet?: number;
  /** draw the faint cell grid */
  showGrid?: boolean;
}

export function cellAtScreen(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return {
    x: Math.floor((sx - vp.ox) / vp.cell),
    y: Math.floor((sy - vp.oy) / vp.cell),
  };
}

export function cellOrigin(vp: Viewport, x: number, y: number): { sx: number; sy: number } {
  return { sx: vp.ox + x * vp.cell, sy: vp.oy + y * vp.cell };
}

/** Fit a board into a viewport, clamped so a level is readable without panning. */
export function fitViewport(
  boardW: number,
  boardH: number,
  screenW: number,
  screenH: number,
  min = 16,
  max = 48,
): Viewport {
  const cell = Math.max(min, Math.min(max, Math.floor(Math.min(screenW / boardW, screenH / boardH))));
  return {
    cell,
    ox: Math.round((screenW - boardW * cell) / 2),
    oy: Math.round((screenH - boardH * cell) / 2),
  };
}

function traceColor(v: V): string {
  if (v === HI) return T.traceOn;
  if (v === X) return T.traceUnknown;
  if (v === Z) return T.traceFloat;
  return T.traceOff;
}

function netValueAt(world: World, i: number, slot: 0 | 1): V {
  const net = slot === 0 ? world.map.netA[i] : world.map.netB[i];
  if (net < 0) return LO;
  return world.nets.value[net] as V;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * One arm of a trace, from the cell's edge to its centre.
 * Both halves of a run therefore meet exactly at the boundary, with no seam.
 */
function armRect(d: Dir, S_: number, t: number): [number, number, number, number] {
  const c = S_ / 2;
  const h = t / 2;
  switch (d) {
    case N:
      return [c - h, 0, t, c + h];
    case S:
      return [c - h, c - h, t, c + h];
    case W:
      return [0, c - h, c + h, t];
    default:
      return [c - h, c - h, c + h, t];
  }
}

function withGlow(ctx: CanvasRenderingContext2D, lit: boolean, size: number, draw: () => void) {
  if (lit) {
    ctx.save();
    ctx.shadowColor = T.traceGlow;
    ctx.shadowBlur = size * 0.5;
    draw();
    ctx.restore();
  }
  draw();
}

// ---------------------------------------------------------------- pieces

function drawWireCell(ctx: CanvasRenderingContext2D, world: World, x: number, y: number, vp: Viewport) {
  const S_ = vp.cell;
  const t = Math.max(3, Math.round(S_ * TRACE));
  const i = idx(world.grid, x, y);
  const cell = world.grid.cells[i];
  const kind = cellKind(cell);

  if (kind === Kind.Cross) {
    // north-south passes under; east-west is drawn over it with a board-coloured
    // gap, which reads instantly as "these do not touch"
    const vVal = netValueAt(world, i, 1);
    const hVal = netValueAt(world, i, 0);
    withGlow(ctx, vVal === HI, S_, () => {
      ctx.fillStyle = traceColor(vVal);
      ctx.fillRect(S_ / 2 - t / 2, 0, t, S_);
    });
    ctx.fillStyle = T.board;
    ctx.fillRect(0, S_ / 2 - t / 2 - Math.max(2, S_ * 0.07), S_, t + Math.max(4, S_ * 0.14));
    withGlow(ctx, hVal === HI, S_, () => {
      ctx.fillStyle = traceColor(hVal);
      ctx.fillRect(0, S_ / 2 - t / 2, S_, t);
    });
    return;
  }

  const v = netValueAt(world, i, 0);
  const col = traceColor(v);
  const mask = kind === Kind.Junction ? 0b1111 : cellMask(cell);

  withGlow(ctx, v === HI, S_, () => {
    ctx.fillStyle = col;
    for (let d = 0 as Dir; d < 4; d++) {
      if (mask & (1 << d)) {
        const [rx, ry, rw, rh] = armRect(d, S_, t);
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
    if (mask === 0) {
      ctx.fillRect(S_ / 2 - t / 2, S_ / 2 - t / 2, t, t);
    }
    if (kind === Kind.Junction) {
      // a solder blob, so a deliberate join never looks like an accidental cross
      ctx.beginPath();
      ctx.arc(S_ / 2, S_ / 2, t * 0.78, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawGlyph(ctx: CanvasRenderingContext2D, kind: Kind, S_: number, rot: Dir, lit: boolean) {
  ctx.save();
  ctx.translate(S_ / 2, S_ / 2);
  ctx.rotate((((rot - E) & 3) * Math.PI) / 2);
  ctx.fillStyle = lit ? T.glyphOn : T.glyph;
  if (lit) {
    ctx.shadowColor = T.traceGlow;
    ctx.shadowBlur = S_ * 0.35;
  }
  const r = S_ * 0.23;
  if (kind === Kind.Inverter || kind === Kind.Delay) {
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r * 0.4, 0);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.fill();
    if (kind === Kind.Inverter) {
      ctx.beginPath();
      ctx.arc(r * 0.72, 0, Math.max(1.4, S_ * 0.072), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawComponent(ctx: CanvasRenderingContext2D, world: World, x: number, y: number, vp: Viewport) {
  const S_ = vp.cell;
  const t = Math.max(3, Math.round(S_ * TRACE));
  const cell = at(world.grid, x, y);
  const kind = cellKind(cell);
  const rot = cellRot(cell);
  const def = kindDef(kind);
  const fw = (def?.w ?? 1) * S_;
  const fh = (def?.h ?? 1) * S_;
  const inset = Math.max(1.5, S_ * BODY_INSET);

  // pin stubs first, so the body sits on top of them and the join looks welded
  for (const p of worldPins(kind, x, y, rot)) {
    const net = (() => {
      const nx = p.x + (p.dir === E ? 1 : p.dir === W ? -1 : 0);
      const ny = p.y + (p.dir === S ? 1 : p.dir === N ? -1 : 0);
      if (!inBounds(world.grid, nx, ny)) return LO;
      const ni = idx(world.grid, nx, ny);
      const slot = world.map.netB[ni] >= 0 && (p.dir === N || p.dir === S) ? 1 : 0;
      return netValueAt(world, ni, slot as 0 | 1);
    })();
    ctx.save();
    ctx.translate((p.x - x) * S_, (p.y - y) * S_);
    withGlow(ctx, net === HI, S_, () => {
      ctx.fillStyle = traceColor(net);
      const [rx, ry, rw, rh] = armRect(p.dir, S_, t);
      ctx.fillRect(rx, ry, rw, rh);
    });
    ctx.restore();
  }

  const lit = (() => {
    for (const c of world.comps) {
      if (c.x === x && c.y === y && c.instance < 0) return c.out === HI;
    }
    return false;
  })();

  ctx.fillStyle = lit ? T.bodyLit : T.body;
  roundRect(ctx, inset, inset, fw - inset * 2, fh - inset * 2, Math.max(2, S_ * 0.16));
  ctx.fill();
  ctx.strokeStyle = lit ? T.glyphOn : T.bodyEdge;
  ctx.lineWidth = Math.max(1, S_ * 0.045);
  ctx.stroke();

  if (kind === Kind.Led) {
    const cx = fw / 2;
    const cy = fh / 2;
    if (lit) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S_ * 0.95);
      g.addColorStop(0, 'rgba(255,214,160,0.95)');
      g.addColorStop(0.35, 'rgba(255,180,84,0.42)');
      g.addColorStop(1, 'rgba(255,180,84,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-S_ * 0.6, -S_ * 0.6, fw + S_ * 1.2, fh + S_ * 1.2);
    }
    ctx.fillStyle = lit ? T.ledOn : T.ledOff;
    ctx.beginPath();
    ctx.arc(cx, cy, S_ * 0.24, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === Kind.Source || kind === Kind.Sink || kind === Kind.Switch) {
    const name = world.pinNames.get(`${x},${y}`) ?? '';
    ctx.fillStyle = lit ? T.glyphOn : T.glyph;
    ctx.font = `600 ${Math.round(S_ * 0.4)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 3).toUpperCase(), fw / 2, fh / 2 + S_ * 0.02);
    return;
  }

  drawGlyph(ctx, kind, S_, rot, lit);
}

function drawBlueprintInstance(
  ctx: CanvasRenderingContext2D,
  world: World,
  instance: number,
  vp: Viewport,
) {
  const place = world.placements[instance];
  const bp = world.library.get(place.id);
  if (!bp) return;
  const S_ = vp.cell;
  const t = Math.max(3, Math.round(S_ * TRACE));
  const { sx, sy } = cellOrigin(vp, place.x, place.y);
  const inset = Math.max(1.5, S_ * BODY_INSET);

  ctx.save();
  ctx.translate(sx, sy);

  for (const pin of bp.pins) {
    const px = place.x + pin.dx;
    const py = place.y + pin.dy;
    const nx = px + (pin.dir === E ? 1 : pin.dir === W ? -1 : 0);
    const ny = py + (pin.dir === S ? 1 : pin.dir === N ? -1 : 0);
    let v: V = LO;
    if (inBounds(world.grid, nx, ny)) {
      const ni = idx(world.grid, nx, ny);
      const slot = world.map.netB[ni] >= 0 && (pin.dir === N || pin.dir === S) ? 1 : 0;
      v = netValueAt(world, ni, slot as 0 | 1);
    }
    ctx.save();
    ctx.translate(pin.dx * S_, pin.dy * S_);
    withGlow(ctx, v === HI, S_, () => {
      ctx.fillStyle = traceColor(v);
      const [rx, ry, rw, rh] = armRect(pin.dir, S_, t);
      ctx.fillRect(rx, ry, rw, rh);
    });
    ctx.restore();
  }

  ctx.fillStyle = T.body;
  roundRect(ctx, inset, inset, bp.w * S_ - inset * 2, bp.h * S_ - inset * 2, Math.max(2, S_ * 0.18));
  ctx.fill();
  ctx.strokeStyle = T.bodyEdge;
  ctx.lineWidth = Math.max(1, S_ * 0.05);
  ctx.stroke();

  ctx.fillStyle = T.glyph;
  ctx.font = `600 ${Math.round(Math.min(S_ * 0.42, (bp.w * S_) / 3.2))}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bp.label, (bp.w * S_) / 2, (bp.h * S_) / 2);
  ctx.restore();
}

// ---------------------------------------------------------------- main

export function renderBoard(
  ctx: CanvasRenderingContext2D,
  world: World,
  vp: Viewport,
  screenW: number,
  screenH: number,
  opts: RenderOptions = {},
): void {
  const g = world.grid;
  const S_ = vp.cell;

  ctx.fillStyle = T.board;
  ctx.fillRect(0, 0, screenW, screenH);

  const x0 = Math.max(0, Math.floor(-vp.ox / S_) - 2);
  const y0 = Math.max(0, Math.floor(-vp.oy / S_) - 5);
  const x1 = Math.min(g.w - 1, Math.ceil((screenW - vp.ox) / S_) + 2);
  const y1 = Math.min(g.h - 1, Math.ceil((screenH - vp.oy) / S_) + 5);

  // board face and grid
  const bx = vp.ox;
  const by = vp.oy;
  ctx.fillStyle = T.board;
  ctx.fillRect(bx, by, g.w * S_, g.h * S_);
  if (opts.showGrid !== false && S_ >= 12) {
    ctx.strokeStyle = T.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      const sx = Math.round(bx + x * S_) + 0.5;
      ctx.moveTo(sx, by);
      ctx.lineTo(sx, by + g.h * S_);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      const sy = Math.round(by + y * S_) + 0.5;
      ctx.moveTo(bx, sy);
      ctx.lineTo(bx + g.w * S_, sy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = T.gridStrong;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, g.w * S_ - 1, g.h * S_ - 1);

  // locked cells
  ctx.fillStyle = T.locked;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (g.locked[idx(g, x, y)]) {
        const { sx, sy } = cellOrigin(vp, x, y);
        ctx.fillRect(sx, sy, S_, S_);
      }
    }
  }

  // traces
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = cellKind(at(g, x, y));
      if (k !== Kind.Wire && k !== Kind.Junction && k !== Kind.Cross) continue;
      const { sx, sy } = cellOrigin(vp, x, y);
      ctx.save();
      ctx.translate(sx, sy);
      drawWireCell(ctx, world, x, y, vp);
      ctx.restore();
    }
  }

  // components
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = cellKind(at(g, x, y));
      if (k === Kind.Empty || k === Kind.Blueprint) continue;
      if (k === Kind.Wire || k === Kind.Junction || k === Kind.Cross) continue;
      const { sx, sy } = cellOrigin(vp, x, y);
      ctx.save();
      ctx.translate(sx, sy);
      drawComponent(ctx, world, x, y, vp);
      ctx.restore();
    }
  }

  for (let i = 0; i < world.placements.length; i++) drawBlueprintInstance(ctx, world, i, vp);

  // overlays
  if (opts.ghost) {
    const { sx, sy } = cellOrigin(vp, opts.ghost.x, opts.ghost.y);
    ctx.strokeStyle = opts.ghost.ok ? T.accent : T.bad;
    ctx.fillStyle = opts.ghost.ok ? T.accentSoft : 'rgba(224,82,82,0.16)';
    ctx.lineWidth = 2;
    ctx.fillRect(sx, sy, opts.ghost.w * S_, opts.ghost.h * S_);
    ctx.strokeRect(sx + 1, sy + 1, opts.ghost.w * S_ - 2, opts.ghost.h * S_ - 2);
  } else if (opts.hover && inBounds(g, opts.hover.x, opts.hover.y)) {
    const { sx, sy } = cellOrigin(vp, opts.hover.x, opts.hover.y);
    ctx.strokeStyle = T.accentSoft;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx + 1, sy + 1, S_ - 2, S_ - 2);
  }

  if (opts.highlightNet !== undefined && opts.highlightNet >= 0) {
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1.5;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = idx(g, x, y);
        if (world.map.netA[i] === opts.highlightNet || world.map.netB[i] === opts.highlightNet) {
          const { sx, sy } = cellOrigin(vp, x, y);
          ctx.strokeRect(sx + 1.5, sy + 1.5, S_ - 3, S_ - 3);
        }
      }
    }
  }
}
