/**
 * A smoke test that drives the real app in a real browser at phone width.
 *
 * The unit tests prove the simulator; this proves the game. It clicks what a
 * thumb would click — the menu, the palette, the board canvas — and asserts on
 * the world the app actually built, via the `window.etch` debug surface. Every
 * bug this file checks for was found by playing, not by reading.
 *
 *   npm run build && npm run preview &
 *   ETCH_URL=http://localhost:4173 npm run smoke
 *
 * Screenshots land in ETCH_SHOTS (default ./.smoke) for eyeballing.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.ETCH_URL ?? 'http://localhost:4173/';
const OUT = process.env.ETCH_SHOTS ?? '.smoke';
mkdirSync(OUT, { recursive: true });

const log = [];
function ok(name, pass, detail = '') {
  log.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!pass) process.exitCode = 1;
}

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => log.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') log.push(`CONSOLE ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const chips = () => page.$$eval('.chips .chip .chip-label', (n) => n.map((e) => e.textContent));
const ctrls = () =>
  page.$$eval('.controls .chip', (n) =>
    n.map((e) => ({ label: e.querySelector('.chip-label')?.textContent, disabled: e.disabled })),
  );
const cellSize = () => page.evaluate(() => window.etch.vp?.cell ?? null);

// ------------------------------------------------------------------ 1. sandbox
await page.click('.chapter:last-of-type .level');
await page.waitForSelector('.board-canvas');
const sandboxChips = await chips();
ok(
  'sandbox has its own palette',
  sandboxChips.includes('SW') && sandboxChips.includes('LED') && sandboxChips.includes('CLK'),
  sandboxChips.join(' '),
);
ok('sandbox has no verification drawer', (await page.$('.scope-drawer')) === null);
const sandboxCtrls = await ctrls();
ok(
  'the sandbox offers no STEP or VERIFY',
  !sandboxCtrls.some((c) => c.label === 'STEP' || c.label === 'VERIFY'),
  sandboxCtrls.map((c) => c.label).join(' '),
);
const clipped = await page.evaluate(() => {
  const row = document.querySelector('.controls');
  return [...row.children].filter((c) => c.getBoundingClientRect().right > row.getBoundingClientRect().right + 1).length;
});
ok('no control is clipped off the right edge', clipped === 0, `${clipped} clipped`);

// place a switch and an LED, wire them, toggle the switch, then edit the board
async function cellXY(cx, cy) {
  // ask the page where a cell is, using the same transform the renderer uses
  return page.evaluate(
    ([cx, cy]) => {
      const v = window.etch.vp;
      const r = document.querySelector('.board-canvas').getBoundingClientRect();
      return { x: r.left + v.ox + (cx + 0.5) * v.cell, y: r.top + v.oy + (cy + 0.5) * v.cell };
    },
    [cx, cy],
  );
}

async function pick(label) {
  await page.click(`.chips .chip:has(.chip-label:text-is("${label}"))`);
}
async function tapCell(cx, cy) {
  const p = await cellXY(cx, cy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}
async function dragCells(a, b2) {
  const p = await cellXY(a[0], a[1]);
  const q = await cellXY(b2[0], b2[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await page.mouse.up();
}

const visible = await page.evaluate(() => {
  const v = window.etch.vp;
  const r = document.querySelector('.board-canvas').getBoundingClientRect();
  return {
    x0: Math.ceil(-v.ox / v.cell),
    y0: Math.ceil(-v.oy / v.cell),
    x1: Math.floor((r.width - v.ox) / v.cell) - 1,
    y1: Math.floor((r.height - v.oy) / v.cell) - 1,
    cell: v.cell,
  };
});
log.push(`      visible cells ${JSON.stringify(visible)}`);
const CX = visible.x0 + 1;
const CY = visible.y0 + 2;

const cs = await cellSize();
ok('sandbox cell size is thumb-sized', cs !== null && cs >= 28, `cell=${cs}`);

await pick('SW');
await tapCell(CX, CY);
await pick('LED');
await tapCell(CX + 6, CY);
await pick('WIRE');
await dragCells([CX + 1, CY], [CX + 5, CY]);

const snapshot = () =>
  page.evaluate(() => {
    const w = window.etch.session.world;
    return {
      comps: w.comps.map((c) => ({ x: c.x, y: c.y, kind: c.kind, state: c.state })),
      switches: [...w.switches.entries()],
      placements: w.comps.length,
    };
  });

let s = await snapshot();
ok('sandbox placed two components', s.placements === 2, JSON.stringify(s.placements));

await pick('PROBE');
await tapCell(CX, CY);
s = await snapshot();
const swOn = s.switches.find(([k]) => k === `${CX},${CY}`)?.[1];
ok('switch toggles in the sandbox', swOn === 1, JSON.stringify(s.switches));

// now edit the board — the toggle must survive the rebuild
await pick('WIRE');
await dragCells([CX + 3, CY + 2], [CX + 5, CY + 2]);
s = await snapshot();
ok(
  'switch position survives an edit',
  s.switches.find(([k]) => k === `${CX},${CY}`)?.[1] === 1,
  JSON.stringify(s.switches),
);

// LED lights when driven
await page.click('.controls .chip:has(.chip-label:text-is("RUN"))');
await page.waitForTimeout(700);
const lit = await page.evaluate(() => {
  const w = window.etch.session.world;
  const led = w.comps.find((c) => c.kind === 10);
  if (!led) return null;
  // the lamp reads its input NET, not a state field
  return { net: led.inNets[0], value: w.nets.value[led.inNets[0]] };
});
ok('the lamp lights from a switch through a wire', lit !== null && lit.value === 2, JSON.stringify(lit));
await page.click('.controls .chip:has(.chip-label:text-is("PAUSE"))');

await page.screenshot({ path: `${OUT}/01-sandbox.png` });

// ------------------------------------------------------------------ 4. clear
const before = (await snapshot()).placements;
await page.click('.controls .chip:has(.chip-label:text-is("CLEAR"))');
let after = (await snapshot()).placements;
ok('CLEAR empties the board', before > 0 && after === 0, `${before} -> ${after}`);
await page.click('.controls .chip:has(.chip-label:text-is("UNDO"))');
after = (await snapshot()).placements;
ok('UNDO brings the board back', after === before, `${after} vs ${before}`);
const redoEnabled = (await ctrls()).find((c) => c.label === 'REDO')?.disabled === false;
ok('REDO enables after an undo', redoEnabled);

// ------------------------------------------------------------------ back to levels
await page.click('.back[aria-label="back"]');
await page.waitForSelector('.menu');

// open level 1 and check the palette is the LEVEL palette, not the sandbox one
await page.click('.chapter:first-of-type .level');
await page.waitForSelector('.board-canvas');
if (await page.$('.sheet .btn.primary')) await page.click('.sheet .btn.primary');
const lvChips = await chips();
ok('a level keeps its own palette', !lvChips.includes('CLK'), lvChips.join(' '));
ok('a level has the verification drawer', (await page.$('.scope-drawer')) !== null);

// ------------------------------------------------------------------ 5. step
const playhead2 = () =>
  page.evaluate(() => {
    const r = document.querySelector('.scope-playhead');
    return r ? Number(r.getAttribute('x')) : null;
  });
const playhead = () =>
  page.evaluate(() => {
    const r = document.querySelector('.scope-playhead');
    return r ? Number(r.getAttribute('x')) : null;
  });
const step0 = await playhead();
await page.click('.controls .chip:has(.chip-label:text-is("STEP"))');
const step1 = await playhead();
ok('STEP moves the playhead', step0 !== null && step1 !== null && step1 !== step0, `${step0} -> ${step1}`);

const inputsAt = () =>
  page.evaluate(() => [...window.etch.session.world.inputs.entries()]);
const i1 = await inputsAt();
await page.click('.controls .chip:has(.chip-label:text-is("STEP"))');
const i2 = await inputsAt();
log.push(`      step inputs ${JSON.stringify(i1)} -> ${JSON.stringify(i2)}`);

// ------------------------------------------------------------------ 2. cell size on the biggest levels
// Both axes, because chapter 5 grew boards downward rather than sideways: the
// display is seven cells tall, and a level that only fits sideways is no use.
await page.click('.back[aria-label="back"]');
await page.waitForSelector('.menu');
const biggest = await page.evaluate(() => {
  const ls = window.etch.LEVELS;
  const pick = (key) =>
    ls.reduce((best, l) => (!best || l.grid[key] > best[key] ? { id: l.id, ...l.grid } : best), null);
  return { widest: pick('w'), tallest: pick('h') };
});
for (const [which, lv] of Object.entries(biggest)) {
  log.push(`      ${which} level ${JSON.stringify(lv)}`);
  const fitted = await page.evaluate(
    ([w, h]) => window.etch.fitViewport(w, h, 390, 500).cell,
    [lv.w, lv.h],
  );
  ok(`${which} level still gets a thumb-sized cell`, fitted >= 28, `${lv.id} cell=${fitted}`);
}

// ------------------------------------------------------------------ 6. briefs
const leaks = await page.evaluate(() => {
  const bad = [];
  for (const l of window.etch.LEVELS) {
    const text = l.brief.join(' ').toLowerCase();
    // a brief that names the exact parts and counts is printing the answer
    if (/\b(two inverters|three inverters|four inverters|place an inverter on each)\b/.test(text))
      bad.push(l.id);
  }
  return bad;
});
ok('no brief spells out the construction', leaks.length === 0, leaks.join(','));


// ------------------------------------------- solve a real level and watch it run
// unlock everything so the menu will open a mid-game level
await page.evaluate(() => {
  const solved = {};
  for (const l of window.etch.LEVELS) solved[l.id] = { components: 99, ticks: 99, area: 99 };
  const unlocked = window.etch.LEVELS.map((l) => l.unlocks).filter(Boolean);
  localStorage.setItem(
    'etch.progress',
    JSON.stringify({ state: { solved, unlocked }, version: 0 }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('.level:has(.level-title:text-is("Half adder"))');
await page.waitForSelector('.board-canvas');
if (await page.$('.sheet .btn.primary')) await page.click('.sheet .btn.primary');
// lay down the reference build, so the board has real gates and real wires on it
await page.evaluate(() => window.etch.solve('half-adder'));
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/03-gates.png` });

await page.click('.controls .chip:has(.chip-label:text-is("VERIFY"))');
await page.waitForTimeout(400);
const verdict = await page.textContent('.scope-status');
ok('the reference build verifies', /All \d+ steps match/.test(verdict ?? ''), verdict?.trim());
await page.screenshot({ path: `${OUT}/04-verified.png` });
if (await page.$('.sheet .btn:not(.primary)')) await page.click('.sheet .btn:not(.primary)');

// the run should now be walking the timeline on its own
const heads = [];
for (let i = 0; i < 6; i++) {
  heads.push(await playhead2());
  await page.waitForTimeout(350);
}
ok('RUN walks the timeline', new Set(heads.filter((h) => h !== null)).size > 1, heads.join(','));
await page.screenshot({ path: `${OUT}/05-running.png` });

const clipped2 = await page.evaluate(() => {
  const row = document.querySelector('.controls');
  return [...row.children].filter((c) => c.getBoundingClientRect().right > row.getBoundingClientRect().right + 1).length;
});
ok('no control is clipped on a level either', clipped2 === 0, `${clipped2} clipped`);

await page.screenshot({ path: `${OUT}/02-level.png` });
await b.close();

console.log(log.join('\n'));
