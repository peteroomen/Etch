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

import { Dir, E, Kind, N, S, W, isWireFamily, kindDef, maskBit, opposite, worldPins } from '../sim/kinds';
import { at, cellKind, cellMask, cellRot, effectiveMask, idx, inBounds } from '../sim/grid';
import { HI, LO, V, V_NAME, X, Z } from '../sim/values';
import { World, pinNet } from '../sim/world';
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
  /** footprint preview for the currently held component, with its facing */
  ghost?: { x: number; y: number; w: number; h: number; ok: boolean; kind?: Kind; rot?: Dir } | null;
  /** net id to highlight, from the inspect tool */
  highlightNet?: number;
  /** draw the faint cell grid */
  showGrid?: boolean;
  /** cells a drag is about to lay down */
  preview?: { x: number; y: number }[] | null;
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
  min = 28,
  max = 48,
): Viewport {
  // Never shrink below a thumb. A wide level is meant to need panning — that is
  // what the two-finger gesture is for — and squeezing an 18-wide board into
  // 390px gave 21px cells, under the minimum this was supposed to hold.
  const cell = Math.max(min, Math.min(max, Math.floor(Math.min(screenW / boardW, screenH / boardH))));
  return {
    cell,
    ox: Math.round((screenW - boardW * cell) / 2),
    oy: Math.round((screenH - boardH * cell) / 2),
  };
}

/** Keep at least a few cells of board on screen, however far you fling it. */
export function clampViewport(
  vp: Viewport,
  boardW: number,
  boardH: number,
  screenW: number,
  screenH: number,
): Viewport {
  const margin = vp.cell * 3;
  return {
    cell: vp.cell,
    ox: Math.min(screenW - margin, Math.max(margin - boardW * vp.cell, vp.ox)),
    oy: Math.min(screenH - margin, Math.max(margin - boardH * vp.cell, vp.oy)),
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

/** Step one cell in a direction. */
function step(x: number, y: number, d: Dir): { x: number; y: number } {
  return {
    x: x + (d === E ? 1 : d === W ? -1 : 0),
    y: y + (d === S ? 1 : d === N ? -1 : 0),
  };
}

/** Does whatever sits in the neighbouring cell present a pin facing back? */
function neighbourFacesBack(world: World, nx: number, ny: number, back: Dir): boolean {
  const g = world.grid;
  const nc = at(g, nx, ny);
  const nk = cellKind(nc);
  if (nk === Kind.Empty) return false;
  if (isWireFamily(nk)) return (effectiveMask(nc) & maskBit(back)) !== 0;
  if (nk === Kind.Blueprint) {
    const instance = g.owner[idx(g, nx, ny)];
    const place = world.placements[instance];
    const bp = place && world.library.get(place.id);
    if (!bp) return false;
    return bp.pins.some(
      (pin) => place.x + pin.dx === nx && place.y + pin.dy === ny && pin.dir === back,
    );
  }
  return worldPins(nk, nx, ny, cellRot(nc)).some((pin) => pin.dir === back);
}

/**
 * Which arms of a wire cell should actually be drawn.
 *
 * The authored mask is not enough. A junction is stored with no mask at all —
 * electrically it accepts from every side — so drawing it from the mask would
 * put a stub on every face, including ones joined to nothing. That is what
 * legs are. An arm is drawn when there is something at the other end of it.
 *
 * A plain wire keeps arms that run into empty board, because the player drew
 * them and a dangling end should look dangling; it only loses arms that point
 * at a component with no pin on that face.
 */
function visualMask(world: World, x: number, y: number): number {
  const g = world.grid;
  const cell = at(g, x, y);
  const kind = cellKind(cell);
  const owned = kind === Kind.Wire ? cellMask(cell) : 0b1111;
  let out = 0;

  for (let d = 0 as Dir; d < 4; d++) {
    if ((owned & maskBit(d)) === 0) continue;
    const n = step(x, y, d);
    if (!inBounds(g, n.x, n.y)) continue;
    const connects = neighbourFacesBack(world, n.x, n.y, opposite(d));
    if (connects) {
      out |= maskBit(d);
    } else if (kind === Kind.Wire && cellKind(at(g, n.x, n.y)) === Kind.Empty) {
      out |= maskBit(d); // a stub the player drew, ending in open board
    }
  }
  return out;
}

function drawWireCell(ctx: CanvasRenderingContext2D, world: World, x: number, y: number, vp: Viewport) {
  const S_ = vp.cell;
  const t = Math.max(3, Math.round(S_ * TRACE));
  const i = idx(world.grid, x, y);
  const kind = cellKind(world.grid.cells[i]);
  const mask = visualMask(world, x, y);

  if (kind === Kind.Cross) {
    // north-south passes under; east-west is drawn over it with a board-coloured
    // gap, which reads instantly as "these do not touch"
    const vMask = mask & (maskBit(N) | maskBit(S));
    const hMask = mask & (maskBit(E) | maskBit(W));
    const vVal = netValueAt(world, i, 1);
    const hVal = netValueAt(world, i, 0);

    if (vMask) {
      withGlow(ctx, vVal === HI, S_, () => {
        ctx.fillStyle = traceColor(vVal);
        for (const d of [N, S] as Dir[]) {
          if (vMask & maskBit(d)) {
            const [rx, ry, rw, rh] = armRect(d, S_, t);
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
      });
    }
    if (hMask) {
      if (vMask) {
        ctx.fillStyle = T.board;
        ctx.fillRect(0, S_ / 2 - t / 2 - Math.max(2, S_ * 0.07), S_, t + Math.max(4, S_ * 0.14));
      }
      withGlow(ctx, hVal === HI, S_, () => {
        ctx.fillStyle = traceColor(hVal);
        for (const d of [E, W] as Dir[]) {
          if (hMask & maskBit(d)) {
            const [rx, ry, rw, rh] = armRect(d, S_, t);
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
      });
    }
    return;
  }

  const v = netValueAt(world, i, 0);
  withGlow(ctx, v === HI, S_, () => {
    ctx.fillStyle = traceColor(v);
    for (let d = 0 as Dir; d < 4; d++) {
      if (mask & maskBit(d)) {
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
  if (kind === Kind.Or) {
    // the standard OR shield: concave back, so it never reads as a buffer
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.quadraticCurveTo(-r * 0.3, 0, -r, r);
    ctx.quadraticCurveTo(r * 0.35, r * 0.9, r * 1.05, 0);
    ctx.quadraticCurveTo(r * 0.35, -r * 0.9, -r, -r);
    ctx.closePath();
    ctx.fill();
  } else if (kind === Kind.Inverter || kind === Kind.Delay) {
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

/**
 * A seven-segment display, lit segment by segment from the nets feeding it.
 *
 * Every readout before this one was a single lamp, so "did it work" was a
 * yes-or-no light. This is the first thing on the board that shows a NUMBER,
 * and the whole point is that the shape is not drawn by the game — it is
 * whatever seven separate wires happen to be holding.
 *
 * Amber, like every live trace: a lit segment is a lit net, and the display
 * should read as the same substance as the wire feeding it.
 */
function drawSeg7(
  ctx: CanvasRenderingContext2D,
  world: World,
  x: number,
  y: number,
  rot: Dir,
  S_: number,
  fw: number,
  fh: number,
) {
  const pins = worldPins(Kind.Seg7, x, y, rot);
  const on = pins.map((p) => {
    const net = pinNet(world, p.x, p.y, p.dir);
    return net >= 0 && (world.nets.value[net] as V) === HI;
  });

  // roughly one to two, which is the proportion of a real digit — the body is
  // 3x7 cells, so equal padding on both axes would draw something far too thin
  const th = Math.max(2, S_ * 0.17); // segment thickness
  const padX = fw * 0.14;
  const padY = fh * 0.15;
  const left = padX;
  const right = fw - padX;
  const top = padY;
  const bottom = fh - padY;
  const mid = (top + bottom) / 2;
  const gap = th * 0.5; // so corners read as separate segments, not a box

  const bar = (bx: number, by: number, bw: number, bh: number, lit: boolean) => {
    ctx.fillStyle = lit ? T.ledOn : T.ledOff;
    withGlow(ctx, lit, S_, () => {
      roundRect(ctx, bx, by, bw, bh, th * 0.35);
      ctx.fill();
    });
  };
  const horiz = (cy: number, lit: boolean) =>
    bar(left + gap, cy - th / 2, right - left - gap * 2, th, lit);
  const vert = (cx: number, y0: number, y1: number, lit: boolean) =>
    bar(cx - th / 2, y0 + gap, th, y1 - y0 - gap * 2, lit);

  // pin order is a..g, and so is this
  horiz(top, on[0]); //            a — top
  vert(right, top, mid, on[1]); // b — upper right
  vert(right, mid, bottom, on[2]); // c — lower right
  horiz(bottom, on[3]); //         d — bottom
  vert(left, mid, bottom, on[4]); // e — lower left
  vert(left, top, mid, on[5]); //  f — upper left
  horiz(mid, on[6]); //            g — middle
}

/**
 * A nixie tube: ten stacked numerals, and the one whose cathode is pulled up
 * glows.
 *
 * Drawn as an actual numeral rather than a segment shape, because that is what
 * a nixie is — ten separate wire digits behind each other in one envelope, not
 * a digit assembled out of bars. The unlit ones are faintly visible for the
 * same reason they are in the real tube.
 *
 * If more than one cathode is high, more than one numeral lights, overlapping.
 * That is what the real tube does, and it is a better bug report than any error
 * message: a driver that is not one-hot LOOKS wrong.
 */
function drawNixie(
  ctx: CanvasRenderingContext2D,
  world: World,
  x: number,
  y: number,
  rot: Dir,
  S_: number,
  fw: number,
  fh: number,
) {
  const pins = worldPins(Kind.Nixie, x, y, rot);
  const cx = fw / 2;
  const cy = fh / 2;
  ctx.save();
  ctx.font = `600 ${Math.round(S_ * 2.6)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // the dark ones first, so a lit numeral always sits on top of the stack
  const lit: number[] = [];
  pins.forEach((p, i) => {
    const net = pinNet(world, p.x, p.y, p.dir);
    if (net >= 0 && (world.nets.value[net] as V) === HI) lit.push(i);
  });
  ctx.fillStyle = T.ledOff;
  for (let i = 0; i < 10; i++) {
    if (!lit.includes(i)) ctx.fillText(String(i), cx, cy);
  }
  for (const i of lit) {
    withGlow(ctx, true, S_ * 2, () => {
      ctx.fillStyle = T.ledOn;
      ctx.fillText(String(i), cx, cy);
    });
  }
  ctx.restore();

  // a tick beside each pin, so it is obvious which row is which digit
  if (S_ >= 18) {
    ctx.fillStyle = T.glyph;
    ctx.font = `500 ${Math.round(S_ * 0.34)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    pins.forEach((p, i) => {
      ctx.fillText(String(i), S_ * 0.22, (p.y - y + 0.5) * S_);
    });
  }
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

  // Pin stubs first, so the body sits on top and the join looks welded — and
  // only where a pin is actually on a net. A pin connected to nothing draws
  // nothing, so a gate you forgot to wire up looks unwired.
  for (const p of worldPins(kind, x, y, rot)) {
    const net = pinNet(world, p.x, p.y, p.dir);
    if (net < 0) continue;
    const v = world.nets.value[net] as V;
    ctx.save();
    ctx.translate((p.x - x) * S_, (p.y - y) * S_);
    withGlow(ctx, v === HI, S_, () => {
      ctx.fillStyle = traceColor(v);
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

  if (kind === Kind.Seg7) {
    drawSeg7(ctx, world, x, y, rot, S_, fw, fh);
    return;
  }

  if (kind === Kind.Nixie) {
    drawNixie(ctx, world, x, y, rot, S_, fw, fh);
    return;
  }

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

  // Mark where the pins are, and which way they face. A gate's input side is
  // otherwise a guess — "top and bottom in, east out" is a perfectly reasonable
  // wrong reading, and the game never corrected it.
  if (S_ >= 18) {
    for (const p of worldPins(kind, x, y, rot)) {
      ctx.save();
      ctx.translate((p.x - x) * S_ + S_ / 2, (p.y - y) * S_ + S_ / 2);
      ctx.rotate((p.dir * Math.PI) / 2);
      const edge = S_ / 2 - inset * 0.55;
      ctx.fillStyle = T.glyph;
      ctx.strokeStyle = T.glyph;
      ctx.lineWidth = Math.max(1, S_ * 0.045);
      if (p.role === 'out') {
        // a solid arrowhead pointing out of the body: signal leaves here
        ctx.beginPath();
        ctx.moveTo(-S_ * 0.09, -edge + S_ * 0.1);
        ctx.lineTo(S_ * 0.09, -edge + S_ * 0.1);
        ctx.lineTo(0, -edge - S_ * 0.02);
        ctx.closePath();
        ctx.fill();
      } else {
        // an open notch: signal arrives here
        ctx.beginPath();
        ctx.moveTo(-S_ * 0.09, -edge - S_ * 0.02);
        ctx.lineTo(0, -edge + S_ * 0.11);
        ctx.lineTo(S_ * 0.09, -edge - S_ * 0.02);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (kind === Kind.Source || kind === Kind.Sink || kind === Kind.Switch) {
    const name = world.pinNames.get(`${x},${y}`) ?? '';
    ctx.fillStyle = lit ? T.glyphOn : T.glyph;
    ctx.font = `600 ${Math.round(S_ * 0.4)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shortPin(name), fw / 2, fh / 2 + S_ * 0.02);
    return;
  }

  drawGlyph(ctx, kind, S_, rot, lit);
}

/**
 * A pin name short enough to read at cell size.
 *
 * Truncating alone turns "qbar" into "QBA", which reads as a different signal
 * entirely — and on a latch, where Q and Q-BAR sit one above the other, that is
 * exactly the pair you cannot afford to confuse. Names that would truncate
 * badly get an explicit short form.
 */
const SHORT_PIN: Record<string, string> = {
  qbar: '/Q',
  carry: 'CY',
  cout: 'CO',
  cin: 'CI',
  sum: 'S',
};

export function shortPin(name: string): string {
  return SHORT_PIN[name] ?? name.slice(0, 3).toUpperCase();
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
    const net = pinNet(world, px, py, pin.dir);
    if (net < 0) continue;
    const v = world.nets.value[net] as V;
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

  // Name every pin, inside the body against its own edge.
  //
  // Until now a placed tile said only what it WAS, never which side was which,
  // so wiring a latch meant guessing whether the top-left pin was D or EN and
  // finding out by running it. The label sits on the pin's own edge so the
  // name and the leg it belongs to cannot be read apart.
  if (S_ >= 20) {
    const fs = Math.max(7, Math.round(S_ * 0.24));
    const pad = Math.max(2, S_ * 0.1);
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
    for (const pin of bp.pins) {
      const cx = pin.dx * S_;
      const cy = pin.dy * S_;
      // an output names a signal the tile makes; an input names one it wants
      ctx.fillStyle = pin.role === 'out' ? T.glyph : T.textDim;
      switch (pin.dir) {
        case W:
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(shortPin(pin.name), cx + inset + pad, cy + S_ / 2);
          break;
        case E:
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(shortPin(pin.name), cx + S_ - inset - pad, cy + S_ / 2);
          break;
        case N:
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(shortPin(pin.name), cx + S_ / 2, cy + inset + pad * 0.5);
          break;
        default:
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(shortPin(pin.name), cx + S_ / 2, cy + S_ - inset - pad * 0.5);
      }
    }
  }
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
  if (opts.preview && opts.preview.length > 1) {
    const t = Math.max(3, Math.round(S_ * TRACE));
    ctx.fillStyle = T.ghost;
    for (const p of opts.preview) {
      if (!inBounds(g, p.x, p.y)) continue;
      const { sx, sy } = cellOrigin(vp, p.x, p.y);
      ctx.fillRect(sx + S_ / 2 - t / 2, sy + S_ / 2 - t / 2, t, t);
    }
    ctx.strokeStyle = T.traceOn;
    ctx.lineWidth = Math.max(2, S_ * 0.1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    let started = false;
    for (const p of opts.preview) {
      if (!inBounds(g, p.x, p.y)) {
        started = false;
        continue;
      }
      const { sx, sy } = cellOrigin(vp, p.x, p.y);
      const cx = sx + S_ / 2;
      const cy = sy + S_ / 2;
      if (started) ctx.lineTo(cx, cy);
      else ctx.moveTo(cx, cy);
      started = true;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (opts.ghost) {
    const { sx, sy } = cellOrigin(vp, opts.ghost.x, opts.ghost.y);
    ctx.strokeStyle = opts.ghost.ok ? T.accent : T.bad;
    ctx.fillStyle = opts.ghost.ok ? T.accentSoft : 'rgba(224,82,82,0.16)';
    ctx.lineWidth = 2;
    ctx.fillRect(sx, sy, opts.ghost.w * S_, opts.ghost.h * S_);
    ctx.strokeRect(sx + 1, sy + 1, opts.ghost.w * S_ - 2, opts.ghost.h * S_ - 2);

    // which way it will face, and where its pins will land — placing a gate
    // backwards is invisible otherwise, and it is the commonest way to get stuck
    if (opts.ghost.kind !== undefined && opts.ghost.ok) {
      const gk = opts.ghost.kind;
      const grot = (opts.ghost.rot ?? E) as Dir;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = 0.85;
      for (const p of worldPins(gk, opts.ghost.x, opts.ghost.y, grot)) {
        ctx.save();
        ctx.translate((p.x - opts.ghost.x) * S_, (p.y - opts.ghost.y) * S_);
        ctx.fillStyle = p.role === 'out' ? T.traceOn : T.accent;
        const [rx, ry, rw, rh] = armRect(p.dir, S_, Math.max(3, Math.round(S_ * TRACE * 0.7)));
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
      }
      drawGlyph(ctx, gk, S_, grot, false);
      ctx.restore();
    }
  } else if (opts.hover && inBounds(g, opts.hover.x, opts.hover.y)) {
    const { sx, sy } = cellOrigin(vp, opts.hover.x, opts.hover.y);
    ctx.strokeStyle = T.accentSoft;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx + 1, sy + 1, S_ - 2, S_ - 2);
  }

  if (opts.highlightNet !== undefined && opts.highlightNet >= 0) {
    const net = opts.highlightNet;
    const v = (world.nets.value[net] ?? Z) as V;
    const drivers = world.nets.drivers[net]?.length ?? 0;
    const label = `NET ${net}  ·  ${V_NAME[v]}  ·  ${drivers} driver${drivers === 1 ? '' : 's'}`;
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,12,16,0.92)';
    ctx.fillRect(8, 8, tw + 18, 26);
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 8.5, tw + 17, 25);
    ctx.fillStyle = v === HI ? T.traceOn : v === X ? T.bad : T.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 17, 22);

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
