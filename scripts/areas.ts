/** How wasteful is each reference layout? Area par comes from these. */
import { LEVELS } from '../src/game/levels';
import { LIBRARY } from '../src/game/blueprints';
import { createLevelWorld, runTimeline } from '../src/game/level';

console.log('level            area  cells  comps  density');
for (const l of LEVELS) {
  const w = createLevelWorld(l, LIBRARY);
  l.reference(w);
  const v = runTimeline(w, l);
  const cells = l.grid.w * l.grid.h;
  console.log(
    `${l.id.padEnd(16)} ${String(v.score.area).padStart(4)}  ${String(cells).padStart(5)}` +
      `  ${String(v.score.components).padStart(5)}  ${(v.score.area / Math.max(1, v.score.components)).toFixed(1).padStart(6)}`,
  );
}
