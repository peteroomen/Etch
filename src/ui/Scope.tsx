/**
 * The verification scope.
 *
 * Every signal plotted over the whole timeline: inputs on top, required
 * outputs below with your actual trace drawn over them, and the first
 * divergence marked. A failure should be something you can see, not a count
 * you have to interpret.
 */

import { Level, Verification } from '../game/level';

interface Props {
  level: Level;
  verification: Verification | null;
  compact?: boolean;
  /** the step the board is showing right now, marked on the chart */
  playStep?: number;
}

const ROW = 26;
const GAP = 6;
const LABEL_W = 46;
const STEP_W = 22;

function wavePath(bits: (boolean | null)[], stepW: number, top: number, height: number): string {
  const hi = top + 3;
  const lo = top + height - 3;
  let d = '';
  let prevY: number | null = null;
  bits.forEach((b, i) => {
    if (b === null) {
      prevY = null;
      return;
    }
    const y = b ? hi : lo;
    const x0 = i * stepW;
    const x1 = x0 + stepW;
    if (prevY === null) d += ` M ${x0} ${y}`;
    else if (prevY !== y) d += ` L ${x0} ${y}`;
    d += ` L ${x1} ${y}`;
    prevY = y;
  });
  return d.trim();
}

export function Scope({ level, verification, compact, playStep }: Props) {
  const t = level.timeline;
  const ins = Object.keys(t.inputs);
  const outs = Object.keys(t.outputs);
  const stepW = compact ? 16 : STEP_W;
  const rowH = compact ? 20 : ROW;
  const rows = ins.length + outs.length;
  const width = LABEL_W + t.steps * stepW + 8;
  const height = rows * (rowH + GAP) + 26;

  const actual: Record<string, boolean[]> = {};
  if (verification) {
    for (const n of outs) actual[n] = verification.steps.map((s) => s.actual[n]);
  }
  const failStep = verification?.firstFailure ?? null;

  return (
    <div className="scope">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="verification timeline"
      >
        {/* step grid */}
        <g transform={`translate(${LABEL_W},0)`}>
          {Array.from({ length: t.steps + 1 }, (_, i) => (
            <line
              key={i}
              x1={i * stepW}
              y1={14}
              x2={i * stepW}
              y2={height - 12}
              className={i % 4 === 0 ? 'scope-grid strong' : 'scope-grid'}
            />
          ))}
          {playStep !== undefined && playStep >= 0 && playStep < t.steps && (
            <rect
              x={playStep * stepW}
              y={14}
              width={stepW}
              height={height - 26}
              className="scope-playhead"
            />
          )}
          {failStep !== null && (
            <rect
              x={failStep * stepW}
              y={14}
              width={stepW}
              height={height - 26}
              className="scope-fail-band"
            />
          )}
        </g>

        <text x={0} y={10} className="scope-head">
          IN
        </text>

        {ins.map((name, i) => {
          const top = 16 + i * (rowH + GAP);
          return (
            <g key={name}>
              <text x={0} y={top + rowH / 2 + 4} className="scope-label">
                {name}
              </text>
              <g transform={`translate(${LABEL_W},0)`}>
                <path d={wavePath(t.inputs[name], stepW, top, rowH)} className="scope-in" />
              </g>
            </g>
          );
        })}

        <text x={0} y={16 + ins.length * (rowH + GAP) + 2} className="scope-head">
          OUT
        </text>

        {outs.map((name, i) => {
          const top = 16 + (ins.length + i) * (rowH + GAP) + 8;
          const want = t.outputs[name];
          const got = actual[name];
          return (
            <g key={name}>
              <text x={0} y={top + rowH / 2 + 4} className="scope-label">
                {name}
              </text>
              <g transform={`translate(${LABEL_W},0)`}>
                <path d={wavePath(want, stepW, top, rowH)} className="scope-want" />
                {got && <path d={wavePath(got, stepW, top, rowH)} className="scope-got" />}
                {got &&
                  want.map((wv, s) =>
                    wv !== null && wv !== got[s] ? (
                      <rect
                        key={s}
                        x={s * stepW}
                        y={top}
                        width={stepW}
                        height={rowH}
                        className="scope-miss"
                      />
                    ) : null,
                  )}
              </g>
            </g>
          );
        })}
      </svg>

      <div className="scope-status">
        {!verification && <span className="dim">Not run yet.</span>}
        {verification?.oscillates && <span className="bad">This oscillates — it never settles.</span>}
        {verification && !verification.oscillates && verification.passed && (
          <span className="good">All {verification.steps.length} steps match.</span>
        )}
        {verification && !verification.oscillates && !verification.passed && (
          <span className="bad">Diverges at step {(verification.firstFailure ?? 0) + 1}.</span>
        )}
      </div>
    </div>
  );
}
