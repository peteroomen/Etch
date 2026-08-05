import { LEVELS } from '../game/levels';
import { parFor } from '../game/level';
import { LIBRARY } from '../game/blueprints';
import { loadLevel, loadSandbox } from '../state/session';
import { useUI } from '../state/store';

export function LevelSelect() {
  const solved = useUI((s) => s.solved);
  const openLevel = useUI((s) => s.openLevel);
  const setScreen = useUI((s) => s.setScreen);

  const chapters = [...new Set(LEVELS.map((l) => l.chapter))];
  const firstUnsolved = LEVELS.findIndex((l) => !solved[l.id]);

  return (
    <div className="menu">
      <header className="menu-head">
        <div className="eyebrow">ETCH · REV A</div>
        <h1>Build a computer out of inverters.</h1>
        <p>
          There is no AND gate here until you make one. Wires join instantly; only components cost
          a tick. Joining two signals consumes them.
        </p>
      </header>

      {chapters.map((ch) => (
        <section key={ch} className="chapter">
          <h2>Chapter {ch}</h2>
          <ol className="level-list">
            {LEVELS.filter((l) => l.chapter === ch).map((level) => {
              const idx = LEVELS.indexOf(level);
              const best = solved[level.id];
              const locked = idx > firstUnsolved && firstUnsolved !== -1;
              const par = parFor(level, LIBRARY);
              return (
                <li key={level.id}>
                  <button
                    className={`level${best ? ' done' : ''}${locked ? ' locked' : ''}`}
                    disabled={locked}
                    onClick={() => {
                      loadLevel(level);
                      openLevel(level.id);
                    }}
                  >
                    <span className="level-no">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="level-body">
                      <span className="level-title">{level.title}</span>
                      <span className="level-teaches">{level.teaches}</span>
                    </span>
                    <span className="level-score">
                      {best ? (
                        <>
                          <b>{best.components}</b>c <b>{best.ticks}</b>t <b>{best.area}</b>a
                        </>
                      ) : locked ? (
                        '—'
                      ) : (
                        <span className="dim">
                          par {par.components}c {par.ticks}t {par.area}a
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section className="chapter">
        <h2>Sandbox</h2>
        <button
          className="level"
          onClick={() => {
            loadSandbox();
            setScreen('play');
          }}
        >
          <span className="level-no">∞</span>
          <span className="level-body">
            <span className="level-title">Free board</span>
            <span className="level-teaches">Everything you have earned, no objective.</span>
          </span>
        </button>
      </section>
    </div>
  );
}
