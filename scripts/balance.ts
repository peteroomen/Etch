import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/game/levels';
import { buildReport } from '../src/model/report';

const started = Date.now();
const md = buildReport(LEVELS);
writeFileSync('docs/balance.md', md + '\n');
console.log(`docs/balance.md written in ${Date.now() - started}ms`);
