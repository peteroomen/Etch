/** Scratch bench for designing sequential circuits before they become levels. */
import { board, buf, inv, path, run, sink, src, render } from '../src/sim/build';
import { linkAllPins } from '../src/sim/draw';
import { readOutput, rebuild, reset, setInput, settle } from '../src/sim/world';

function trace(w: ReturnType<typeof board>, ins: string[], outs: string[], rows: number[][]) {
  linkAllPins(w);
  rebuild(w);
  reset(w);
  for (let i = 0; i < ins.length; i++) setInput(w, ins[i], !!rows[0][i]);
  const first = settle(w, 256);
  const lines: string[] = [`power-on settled=${first.settled} ticks=${first.ticks}`];
  for (const row of rows) {
    ins.forEach((n, i) => setInput(w, n, !!row[i]));
    const s = settle(w, 256);
    const got = outs.map((n) => (readOutput(w, n) ? 1 : 0));
    lines.push(
      `  ${ins.map((n, i) => `${n}=${row[i]}`).join(' ')}  ->  ${outs
        .map((n, i) => `${n}=${got[i]}`)
        .join(' ')}   ${s.settled ? `${s.ticks}t` : 'OSCILLATES'}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- hold (BUF)
{
  const w = board(12, 7);
  src(w, 'a', 0, 3);
  // the buffer reads the very net it drives: once high, it keeps itself high
  run(w, 1, 3, 4, 3);
  buf(w, 5, 3);
  path(w, [6, 3], [6, 1], [2, 1], [2, 3]); // output looped back into its own input
  run(w, 6, 3, 10, 3);
  sink(w, 'q', 11, 3);
  console.log('HOLD via BUF');
  console.log(trace(w, ['a'], ['q'], [[0], [1], [0], [0], [1], [0]]));
  console.log(render(w));
}

// ---------------------------------------------------------------- hold (2 NOT)
{
  const w = board(12, 7);
  src(w, 'a', 0, 3);
  run(w, 1, 3, 4, 3); // net N
  inv(w, 5, 3); // N -> M
  run(w, 6, 3, 7, 3); // net M
  inv(w, 8, 3); // M -> back into N
  path(w, [9, 3], [9, 1], [2, 1], [2, 3]);
  run(w, 6, 3, 10, 3);
  sink(w, 'q', 11, 3);
  console.log('\nHOLD via two inverters');
  console.log(trace(w, ['a'], ['q'], [[0], [1], [0], [0], [1], [0]]));
}

// ---------------------------------------------------------------- SR latch
{
  const w = board(12, 7);
  src(w, 's', 0, 1);
  src(w, 'r', 0, 5);
  run(w, 1, 1, 10, 1); // net B: S ∪ inv1 out
  run(w, 1, 5, 9, 5); // net A: R ∪ inv2 out
  path(w, [9, 5], [9, 4]);
  inv(w, 9, 3, 0 as 0); // N
  path(w, [9, 2], [9, 1]);
  path(w, [1, 1], [1, 2]);
  inv(w, 1, 3, 2 as 2); // S
  path(w, [1, 4], [1, 5]);
  sink(w, 'q', 11, 1);
  console.log('\nSR LATCH');
  console.log(
    trace(
      w,
      ['s', 'r'],
      ['q'],
      [
        [0, 1],
        [0, 0],
        [1, 0],
        [0, 0],
        [0, 1],
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ),
  );
  console.log(render(w));
}
