import { useSyncExternalStore } from 'react';
import { resolvePalette } from '../game/palette';
import { canRedo, canUndo, redo, sessionRev, subscribeSession, undo } from '../state/session';
import { useUI } from '../state/store';

const DIR_ARROW = ['↑', '→', '↓', '←'];

interface Props {
  palette: string[];
  onVerify: () => void;
}

function Glyph({ id }: { id: string }) {
  const map: Record<string, string> = {
    wire: '─',
    erase: '⌫',
    inspect: '◎',
    junction: '●',
    cross: '╫',
    not: '▷o',
    buf: '▷',
    led: '☀',
    switch: '⌁',
    clock: '⎍',
  };
  return <span className="chip-glyph">{map[id] ?? '▣'}</span>;
}

export function Palette({ palette, onVerify }: Props) {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const rot = useUI((s) => s.rot);
  const rotate = useUI((s) => s.rotate);
  const running = useUI((s) => s.running);
  const setRunning = useUI((s) => s.setRunning);
  const rate = useUI((s) => s.rate);
  const setRate = useUI((s) => s.setRate);
  const unlocked = useUI((s) => s.unlocked);
  // the history lives outside React; without this the buttons never re-enable
  useSyncExternalStore(subscribeSession, sessionRev, sessionRev);

  const items = resolvePalette(palette).filter(
    (i) => !i.blueprint || unlocked.includes(i.blueprint),
  );
  const selected = items.find((i) => i.id === tool);

  return (
    <div className="palette">
      {selected && <div className="hint">{selected.hint}</div>}

      <div className="chips" role="toolbar" aria-label="tools">
        {items.map((item) => (
          <button
            key={item.id}
            className={`chip${item.id === tool ? ' sel' : ''}`}
            onClick={() => setTool(item.id)}
            aria-pressed={item.id === tool}
          >
            <Glyph id={item.id} />
            <span className="chip-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="controls">
        <button className="chip wide" onClick={undo} disabled={!canUndo()} aria-label="undo">
          ↶<span className="chip-label">UNDO</span>
        </button>
        <button className="chip wide" onClick={redo} disabled={!canRedo()} aria-label="redo">
          ↷<span className="chip-label">REDO</span>
        </button>
        <button
          className="chip wide"
          onClick={rotate}
          disabled={!!selected?.tool}
          aria-label="rotate"
        >
          {DIR_ARROW[rot]}
          <span className="chip-label">TURN</span>
        </button>
        <button
          className={`chip wide${running ? ' sel' : ''}`}
          onClick={() => setRunning(!running)}
          aria-pressed={running}
        >
          {running ? '❙❙' : '▶'}
          <span className="chip-label">{running ? 'PAUSE' : 'RUN'}</span>
        </button>
        <button className="chip wide accent" onClick={onVerify}>
          ✓<span className="chip-label">VERIFY</span>
        </button>
      </div>

      <label className="rate">
        <span>{rate}/s</span>
        <input
          type="range"
          min={1}
          max={20}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="simulation rate"
        />
      </label>
    </div>
  );
}
