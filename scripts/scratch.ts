/** Scratch bench for designing sequential circuits before they become levels. */
import { board, buf, inv, path, run, sink, src, render } from '../src/sim/build';
import { N, S } from '../src/sim/kinds';
import { linkAllPins } from '../src/sim/draw';
import { componentCount, readOutput, rebuild, reset, setInput, settle } from '../src/sim/world';

function trace(w: ReturnType<typeof board>, ins: string[], outs: string[], rows: number[][]) {
  linkAllPins(w);
  rebuild(w);
  reset(w);
  for (let i = 0; i < ins.length; i++) setInput(w, ins[i], !!rows[0][i]);
  const first = settle(w, 256);
  const lines: string[] = [
    `power-on settled=${first.settled} ticks=${first.ticks}  components=${componentCount(w)}`,
  ];
  let worst = 0;
  for (const row of rows) {
    ins.forEach((n, i) => setInput(w, n, !!row[i]));
    const s = settle(w, 256);
    if (s.settled) worst = Math.max(worst, s.ticks);
    const got = outs.map((n) => (readOutput(w, n) ? 1 : 0));
    lines.push(
      `  ${ins.map((n, i) => `${n}=${row[i]}`).join(' ')}  ->  ${outs
        .map((n, i) => `${n}=${got[i]}`)
        .join(' ')}   ${s.settled ? `${s.ticks}t` : 'OSCILLATES'}`,
    );
  }
  lines.push(`  worst = ${worst}t`);
  return lines.join('\n');
}

/**
 * The D latch the superoptimiser found, built as a real board.
 *
 *   n2 = NOT(d) | NOT(en)        NAND: the set term, active low
 *   n3 = NOT(n2) | NOT(n4)       Q
 *   n4 = NOT(n3) | BUF(en)       Qbar, forced high while EN is high
 *
 * The trick is the BUF. While EN is high it holds Qbar up, so NOT(n4) lets go
 * and Q is decided purely by the set term. When EN falls the BUF lets go and
 * the cross-coupled pair keeps whatever it had. There is no separate reset
 * term at all, which is why this is two parts cheaper than the textbook build.
 *
 * Rows are ordered so that nothing has to cross anything: spines are only as
 * long as they need to be, and the risers pass the short ones by.
 */
function dLatch() {
  const w = board(18, 11);
  src(w, 'en', 0, 1);
  src(w, 'd', 0, 5);

  run(w, 1, 1, 16, 1); // n1 = en, long: it feeds an inverter and the buffer
  run(w, 1, 5, 5, 5); // n0 = d, short: only one inverter reads it

  inv(w, 4, 2, S); // NOT(en) -> n2
  inv(w, 5, 4, N); // NOT(d)  -> n2
  run(w, 3, 3, 10, 3); // n2

  path(w, [10, 3], [10, 5]); // n2 down past the short d spine
  inv(w, 10, 6, S); // NOT(n2) -> n3

  run(w, 2, 7, 12, 7); // n3 = Q
  inv(w, 12, 8, N); // NOT(n4) -> n3
  inv(w, 2, 8, S); // NOT(n3) -> n4
  run(w, 2, 9, 16, 9); // n4

  path(w, [16, 1], [16, 4]); // en down the far right, past every spine
  buf(w, 16, 5, S); // BUF(en) -> n4
  path(w, [16, 6], [16, 9]);

  sink(w, 'q', 13, 7);
  return w;
}

const w = dLatch();
console.log('D LATCH — superoptimiser witness, predicted 6 parts / 2 ticks');
console.log(
  trace(
    w,
    ['d', 'en'],
    ['q'],
    [
      [0, 1], // en high, d low: q low
      [1, 1], // transparent, follows d up
      [1, 0], // door shut, holds high
      [0, 0], // d falls, q must not
      [0, 1], // door open, follows down
      [1, 0], // d rises while shut, q must not
      [1, 1], // door open, follows up
      [0, 0], // shut, holds
    ],
  ),
);
console.log(render(w));
