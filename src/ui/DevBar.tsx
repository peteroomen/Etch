/**
 * The dev strip, shown only under `?dev`.
 *
 * Jump to any level, drop the reference solution onto the board, wipe progress.
 * Everything here is a shortcut past the game, so it is deliberately ugly —
 * nothing on this bar should ever be mistaken for something a player sees.
 */

import { LEVELS, LEVELS_BY_ID } from '../game/levels';
import { commitEdit, loadLevel, session } from '../state/session';
import { useUI } from '../state/store';
import { forgetAll } from '../state/saved';

export function DevBar() {
  const levelId = useUI((s) => s.levelId);
  const openLevel = useUI((s) => s.openLevel);
  const openSandbox = useUI((s) => s.openSandbox);

  const jump = (id: string) => {
    if (id === '') {
      openSandbox();
      return;
    }
    const level = LEVELS_BY_ID.get(id);
    if (!level) return;
    loadLevel(level);
    openLevel(level.id);
  };

  /** Lay down the level's own reference build — the one par is measured from. */
  const solve = () => {
    const level = levelId ? LEVELS_BY_ID.get(levelId) : null;
    if (!level) return;
    loadLevel(level);
    level.reference(session.world);
    commitEdit();
  };

  return (
    <div className="devbar">
      <span>DEV</span>
      <select value={levelId ?? ''} onChange={(e) => jump(e.target.value)} aria-label="jump to level">
        <option value="">— sandbox —</option>
        {LEVELS.map((l, i) => (
          <option key={l.id} value={l.id}>
            {String(i + 1).padStart(2, '0')} {l.title}
          </option>
        ))}
      </select>
      <button onClick={solve} disabled={!levelId}>
        solve
      </button>
      <button
        onClick={() => {
          localStorage.removeItem('etch.progress');
          forgetAll();
          location.reload();
        }}
      >
        wipe
      </button>
    </div>
  );
}
