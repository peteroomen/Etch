/**
 * The play surface: one canvas, one animation loop.
 *
 * Pointer rules that make this work on a phone — one finger is always the
 * current tool, two fingers are always pan and zoom, so drawing never fights
 * the viewport. Strokes are interpolated, because pointermove skips cells at
 * speed and an uninterpolated drag leaves holes in the wire.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Kind } from '../sim/kinds';
import { at, cellKind, idx, inBounds } from '../sim/grid';
import { bresenham, drawStroke, linkComponent, linkPin, Point } from '../sim/draw';
import { Axis, axisOf, clampToBoard, planRoute } from '../sim/route';
import { placeBlueprint, placeComponent, removeAt, setCell, tick } from '../sim/world';
import { Viewport, cellAtScreen, fitViewport, renderBoard } from '../render/board';
import { MAX_CELL, MIN_CELL } from '../render/tokens';
import { paletteItem } from '../game/palette';
import { beginEdit, commitEdit, session, touched } from '../state/session';
import { useUI } from '../state/store';

export function Board() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const vp = useRef<Viewport>({ ox: 0, oy: 0, cell: 30 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** an in-progress wire drag: where it started, which way it set off, what it will lay */
  const route = useRef<{ anchor: Point; axis: Axis | null; path: Point[] } | null>(null);
  /** the last cell the eraser passed through */
  const erasing = useRef<Point | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const lastRev = useRef(-1);
  const fitted = useRef(false);

  const tool = useUI((s) => s.tool);
  const rot = useUI((s) => s.rot);
  const running = useUI((s) => s.running);
  const rate = useUI((s) => s.rate);
  const probeNet = useUI((s) => s.probeNet);
  const setProbeNet = useUI((s) => s.setProbeNet);

  const toolRef = useRef(tool);
  const rotRef = useRef(rot);
  toolRef.current = tool;
  rotRef.current = rot;

  // ---------------------------------------------------------------- editing

  const applyAt = useCallback((x: number, y: number) => {
    const w = session.world;
    if (!inBounds(w.grid, x, y)) return;
    const item = paletteItem(toolRef.current);
    if (!item) return;

    if (item.tool === 'erase') {
      removeAt(w, x, y);
      return;
    }
    if (item.tool === 'junction') {
      setCell(w, x, y, Kind.Junction);
      return;
    }
    if (item.tool === 'cross') {
      setCell(w, x, y, Kind.Cross);
      return;
    }
    if (item.tool === 'inspect') {
      const k = cellKind(at(w.grid, x, y));
      if (k === Kind.Source || k === Kind.Switch) {
        for (const c of w.comps) {
          if (c.x === x && c.y === y) {
            c.state = c.state ? 0 : 1;
            if (c.pin) w.inputs.set(c.pin, c.state === 1);
          }
        }
        touched();
        return;
      }
      setProbeNet(w.map.netA[idx(w.grid, x, y)]);
      return;
    }
    if (item.blueprint) {
      if (placeBlueprint(w, item.blueprint, x, y, rotRef.current)) linkBlueprint(x, y, item.blueprint);
      return;
    }
    if (item.kind !== undefined) {
      if (placeComponent(w, item.kind, x, y, rotRef.current)) linkComponent(w, x, y);
    }
  }, [setProbeNet]);

  const linkBlueprint = (x: number, y: number, id: string) => {
    const w = session.world;
    const bp = w.library.get(id);
    if (!bp) return;
    // same rule as a component's pins: point neighbouring wire at each pin
    for (const pin of bp.pins) linkPin(w, x + pin.dx, y + pin.dy, pin.dir);
  };

  const beginRoute = useCallback((c: Point) => {
    if (!inBounds(session.world.grid, c.x, c.y)) return;
    route.current = { anchor: c, axis: null, path: [c] };
  }, []);

  const extendRoute = useCallback((raw: Point) => {
    const r = route.current;
    if (!r) return;
    const c = clampToBoard(session.world, raw);
    // the drag commits to an axis on its first real movement and keeps it, so
    // the corner lands where you expect rather than flipping under your thumb
    if (!r.axis && (c.x !== r.anchor.x || c.y !== r.anchor.y)) r.axis = axisOf(r.anchor, c);
    r.path = planRoute(session.world, r.anchor, c, r.axis ?? 'h');
  }, []);

  const finishRoute = useCallback(() => {
    const r = route.current;
    route.current = null;
    if (!r || r.path.length === 0) return;
    beginEdit();
    drawStroke(session.world, r.path);
    commitEdit();
  }, []);

  // ---------------------------------------------------------------- pointers

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const rectPos = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      const p = rectPos(e);
      pointers.current.set(e.pointerId, p);

      if (pointers.current.size === 2) {
        // second finger: abandon the drag and switch to viewport gestures
        route.current = null;
        if (erasing.current) {
          erasing.current = null;
          commitEdit();
        }
        const [a, b] = [...pointers.current.values()];
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
        return;
      }
      if (pointers.current.size > 2) return;

      const c = cellAtScreen(vp.current, p.x, p.y);
      const item = paletteItem(toolRef.current);
      if (!item) return;
      if (item.tool === 'inspect') {
        applyAt(c.x, c.y);
        return;
      }
      if (item.tool === 'wire') {
        beginRoute(c);
        return;
      }
      if (item.tool === 'erase') {
        beginEdit();
        erasing.current = c;
        removeAt(session.world, c.x, c.y);
        return;
      }
      // everything else is a tap: place it and be done
      beginEdit();
      applyAt(c.x, c.y);
      commitEdit();
    };

    const onMove = (e: PointerEvent) => {
      const p = rectPos(e);
      if (!pointers.current.has(e.pointerId)) {
        hover.current = cellAtScreen(vp.current, p.x, p.y);
        return;
      }
      pointers.current.set(e.pointerId, p);

      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const prev = pinch.current;
        const factor = prev.dist > 0 ? dist / prev.dist : 1;
        const nextCell = Math.max(MIN_CELL, Math.min(MAX_CELL, vp.current.cell * factor));
        const scale = nextCell / vp.current.cell;
        // keep the point between the fingers fixed while zooming
        vp.current.ox = cx - (prev.cx - vp.current.ox) * scale + (cx - prev.cx);
        vp.current.oy = cy - (prev.cy - vp.current.oy) * scale + (cy - prev.cy);
        vp.current.cell = nextCell;
        pinch.current = { dist, cx, cy };
        return;
      }

      const c = cellAtScreen(vp.current, p.x, p.y);
      hover.current = c;

      if (route.current) {
        extendRoute(c);
        return;
      }
      if (erasing.current) {
        // the eraser stays freehand — you want it to follow your finger exactly
        for (const q of bresenham(erasing.current.x, erasing.current.y, c.x, c.y)) {
          removeAt(session.world, q.x, q.y);
        }
        erasing.current = c;
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size !== 0) return;
      if (route.current) {
        finishRoute();
        return;
      }
      if (erasing.current) {
        erasing.current = null;
        commitEdit();
      }
    };

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    return () => {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
    };
  }, [applyAt, beginRoute, extendRoute, finishRoute]);

  // ---------------------------------------------------------------- loop

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let acc = 0;

    const frame = (now: number) => {
      const cv = canvasRef.current;
      const wrap = wrapRef.current;
      if (!cv || !wrap) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
        cv.width = Math.round(cssW * dpr);
        cv.height = Math.round(cssH * dpr);
        cv.style.width = `${cssW}px`;
        cv.style.height = `${cssH}px`;
        fitted.current = false;
      }
      if (!fitted.current && cssW > 0) {
        vp.current = fitViewport(session.world.grid.w, session.world.grid.h, cssW, cssH);
        fitted.current = true;
      }

      // simulation runs on its own accumulator, never once per frame
      const dt = now - prev;
      prev = now;
      if (running) {
        acc += dt;
        const step = 1000 / Math.max(1, rate);
        let guard = 0;
        while (acc >= step && guard++ < 20) {
          acc -= step;
          tick(session.world);
        }
      } else {
        acc = 0;
      }

      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const item = paletteItem(toolRef.current);
        const ghost =
          item && !item.tool && hover.current
            ? {
                x: hover.current.x,
                y: hover.current.y,
                w: item.w,
                h: item.h,
                ok: inBounds(session.world.grid, hover.current.x, hover.current.y),
              }
            : null;
        renderBoard(ctx, session.world, vp.current, cssW, cssH, {
          hover: hover.current,
          ghost,
          preview: route.current?.path ?? null,
          highlightNet: probeNet,
        });
      }
      lastRev.current = session.rev;
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, rate, probeNet]);

  // refit when the level changes
  useEffect(() => {
    fitted.current = false;
  }, [session.level?.id]);

  return (
    <div className="board-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="board-canvas" />
    </div>
  );
}
