/**
 * Iterate on reference layouts until each one verifies.
 *
 * A reference is where par comes from, so a layout that works but sprawls sets
 * a par nobody should have to match. This prints the score, the failing steps
 * and the board next to each other, so all three can be judged at once.
 *
 *   npx vite-node scripts/refs.ts                  every level
 *   npx vite-node scripts/refs.ts every-digit      just one
 *   npx vite-node scripts/refs.ts 5                a whole chapter
 */
import { LEVELS, LEVELS_BY_ID } from '../src/game/levels';
import { LIBRARY } from '../src/game/blueprints';
import { createLevelWorld, runTimeline } from '../src/game/level';
import { render } from '../src/sim/build';

const args = process.argv.slice(2);
const ids = args.length
  ? args.flatMap((a) =>
      /^\d+$/.test(a) ? LEVELS.filter((l) => l.chapter === +a).map((l) => l.id) : [a],
    )
  : LEVELS.map((l) => l.id);

for (const id of ids) {
  const level = LEVELS_BY_ID.get(id);
  if (!level) {
    console.log(`${id}: NO SUCH LEVEL`);
    continue;
  }
  const w = createLevelWorld(level, LIBRARY);
  level.reference(w);
  const v = runTimeline(w, level);
  console.log(
    `\n## ${level.title} (${id})  ${v.passed ? 'PASS' : 'FAIL'}  ` +
      `${v.score.components}c ${v.score.ticks}t ${v.score.area}a` +
      `${v.oscillates ? '  OSCILLATES' : ''}`,
  );
  if (!v.passed) {
    console.log(
      '  steps: ' +
        v.steps
          .map((st) => `${st.step}${st.ok ? '' : `!${st.settled ? 'mismatch' : 'UNSETTLED'}`}`)
          .join(' '),
    );
    for (const st of v.steps) {
      if (st.ok) continue;
      console.log(
        `  step ${st.step}: in ${JSON.stringify(st.inputs)} want ${JSON.stringify(st.expected)} got ${JSON.stringify(st.actual)} settled=${st.settled}`,
      );
    }
    console.log(render(w));
    for (const f of v.faults.slice(0, 4)) console.log(`  fault: ${f.message}`);
    const outs = Object.keys(level.timeline.outputs);
    for (const n of outs) {
      const want = level.timeline.outputs[n]
        .map((x) => (x === null ? '-' : x ? 1 : 0))
        .join('');
      const got = v.steps.map((s) => (s.actual[n] ? 1 : 0)).join('');
      console.log(`  ${n}: want ${want}  got ${got}`);
    }
  }
}
