import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import { LEVELS, LEVELS_BY_ID } from './game/levels';
import { commitEdit, loadLevel, session } from './state/session';
import { fitViewport } from './render/board';
import { debug } from './state/debug';

// A small debug surface, so the board can be driven from a console or a test
// harness without hand-drawing every wire.
Object.assign(debug, {
  session,
  LEVELS,
  loadLevel,
  commitEdit,
  fitViewport,
  solve(id: string) {
    const level = LEVELS_BY_ID.get(id);
    if (!level) return false;
    loadLevel(level);
    level.reference(session.world);
    commitEdit();
    return true;
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
