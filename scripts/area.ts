import { LEVELS_BY_ID } from '../src/game/levels';
import { analyseLevel } from '../src/model/personas';
import { sampleArea } from '../src/model/layout';

for (const id of ['invert', 'neither', 'not-both', 'both', 'copy', 'one-or-other']) {
  const level = LEVELS_BY_ID.get(id)!;
  const a = analyseLevel(level);
  if (!a.witness) { console.log(`${id.padEnd(14)} no witness`); continue; }
  const t0 = Date.now();
  const s = sampleArea(level, a.witness.circuit, 300, 7);
  if (!s) { console.log(`${id.padEnd(14)} no result`); continue; }
  const spread = s.found ? `${s.min}..${s.max} (median ${s.median})` : 'none verified';
  console.log(
    `${id.padEnd(14)} ref area=${String(s.reference).padStart(3)}  sampled ${spread}` +
    `  hits=${s.found}/${s.trials}  ${Date.now()-t0}ms`
  );
}
