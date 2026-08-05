import { useEffect, useState } from 'react';
import { LIBRARY } from '../game/blueprints';
import { LEVELS, LEVELS_BY_ID } from '../game/levels';
import { Score, Verification, parFor, runTimeline } from '../game/level';
import { reset } from '../sim/world';
import { applyStep, loadLevel, session, settleStep } from '../state/session';
import { useUI } from '../state/store';
import { Board } from './Board';
import { Palette } from './Palette';
import { Scope } from './Scope';
import { LevelSelect } from './LevelSelect';

/**
 * The free board gets everything, including the switches and lamps that are its
 * inputs and outputs — a sandbox with no way to drive or read a circuit is not
 * a sandbox.
 */
const SANDBOX_PALETTE = [
  'wire',
  'junction',
  'cross',
  'not',
  'buf',
  'or',
  'switch',
  'clock',
  'led',
  'nor2',
  'nand2',
  'and2',
  'xor2',
  'halfadder',
  'fulladder',
  'adder4',
];

function Metric({ label, value, par }: { label: string; value: number; par?: number }) {
  const delta = par === undefined ? 0 : value - par;
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {par !== undefined && (
        <span className={`metric-par${delta < 0 ? ' better' : delta > 0 ? ' worse' : ''}`}>
          par {par}
        </span>
      )}
    </div>
  );
}

function Result({
  score,
  par,
  unlocked,
  improved,
  onClose,
  onNext,
}: {
  score: Score;
  par: Score;
  unlocked: string | null;
  improved: boolean;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <div className="sheet" role="dialog" aria-label="verified">
      <div className="sheet-body">
        <div className="eyebrow">Verified</div>
        <h2>{improved ? 'Personal best' : 'It works'}</h2>
        <div className="metrics big">
          <Metric label="COMPONENTS" value={score.components} par={par.components} />
          <Metric label="TICKS" value={score.ticks} par={par.ticks} />
          <Metric label="AREA" value={score.area} par={par.area} />
        </div>
        <p className="dim">
          You cannot minimise all three. Fewer components usually means longer routing; shallower
          logic usually costs more inverters.
        </p>
        {unlocked && (
          <div className="unlock">
            <span className="eyebrow">Unlocked</span>
            <strong>{LIBRARY.get(unlocked)?.name ?? unlocked}</strong>
            <p className="dim">
              Placed as a tile, but it still bills every inverter inside it. Nothing is hidden.
            </p>
          </div>
        )}
        <div className="sheet-actions">
          <button className="btn" onClick={onClose}>
            Keep improving
          </button>
          <button className="btn primary" onClick={onNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const screen = useUI((s) => s.screen);
  const levelId = useUI((s) => s.levelId);
  const setScreen = useUI((s) => s.setScreen);
  const openLevel = useUI((s) => s.openLevel);
  const verification = useUI((s) => s.verification);
  const setVerification = useUI((s) => s.setVerification);
  const setRunning = useUI((s) => s.setRunning);
  const showBrief = useUI((s) => s.showBrief);
  const setShowBrief = useUI((s) => s.setShowBrief);
  const recordSolve = useUI((s) => s.recordSolve);
  const solved = useUI((s) => s.solved);
  const playStep = useUI((s) => s.playStep);

  const [result, setResult] = useState<{ score: Score; unlocked: string | null; improved: boolean } | null>(
    null,
  );
  const [scopeOpen, setScopeOpen] = useState(true);

  const level = levelId ? LEVELS_BY_ID.get(levelId) ?? null : null;

  useEffect(() => {
    setResult(null);
  }, [levelId]);

  if (screen === 'menu') return <LevelSelect />;

  const verify = () => {
    if (!level) return;
    setRunning(false);
    const v: Verification = runTimeline(session.world, level);
    setVerification(v);
    reset(session.world);
    setScopeOpen(true);
    // then play it back, so the verdict comes with something to watch
    applyStep(level, 0);
    useUI.getState().setPlayStep(0);
    setRunning(true);
    if (v.passed) {
      const improved = recordSolve(level.id, v.score, level.unlocks);
      setResult({ score: v.score, unlocked: level.unlocks ?? null, improved });
    }
  };

  const stepOnce = () => {
    if (!level) return;
    setRunning(false);
    const next = (useUI.getState().playStep + 1) % level.timeline.steps;
    settleStep(level, next);
    useUI.getState().setPlayStep(next);
  };

  const goNext = () => {
    if (!level) return;
    const i = LEVELS.indexOf(level);
    const next = LEVELS[i + 1];
    setResult(null);
    if (next) {
      loadLevel(next);
      openLevel(next.id);
    } else {
      setScreen('menu');
    }
  };

  const par = level ? parFor(level, LIBRARY) : null;
  const best = level ? solved[level.id] : undefined;

  return (
    <div className="play">
      <header className="topbar">
        <button className="back" onClick={() => setScreen('menu')} aria-label="back">
          ‹
        </button>
        <div className="topbar-title">
          <strong>{level ? level.title : 'Sandbox'}</strong>
          {level && <span className="dim">{level.teaches}</span>}
        </div>
        {best && par && (
          <div className="metrics">
            <Metric label="C" value={best.components} par={par.components} />
            <Metric label="T" value={best.ticks} par={par.ticks} />
            <Metric label="A" value={best.area} par={par.area} />
          </div>
        )}
        {level && (
          <button className="back" onClick={() => setShowBrief(true)} aria-label="brief">
            ?
          </button>
        )}
      </header>

      <Board level={level} />

      {level && (
        <div className={`scope-drawer${scopeOpen ? ' open' : ''}`}>
          <button className="scope-toggle" onClick={() => setScopeOpen(!scopeOpen)}>
            {scopeOpen ? '▾' : '▴'} VERIFICATION
          </button>
          {scopeOpen && <Scope level={level} verification={verification} playStep={playStep} />}
        </div>
      )}

      <Palette
        palette={level ? level.palette : SANDBOX_PALETTE}
        onVerify={level ? verify : undefined}
        onStep={level ? stepOnce : undefined}
      />

      {level && showBrief && (
        <div className="sheet" role="dialog" aria-label={level.title}>
          <div className="sheet-body">
            <div className="eyebrow">
              Level {LEVELS.indexOf(level) + 1} · Chapter {level.chapter}
            </div>
            <h2>{level.title}</h2>
            {level.brief.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <Scope level={level} verification={null} compact />
            <div className="sheet-actions">
              <button className="btn primary" onClick={() => setShowBrief(false)}>
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {result && par && (
        <Result
          score={result.score}
          par={par}
          unlocked={result.unlocked}
          improved={result.improved}
          onClose={() => setResult(null)}
          onNext={goNext}
        />
      )}
    </div>
  );
}
