/**
 * One slice of a search. Reads its whole job as JSON on stdin, prints the
 * result as JSON on stdout, and says nothing else.
 */
import { SeqOptions, synthesiseSeq } from '../src/model/seq';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const opts = JSON.parse(input) as SeqOptions;
  const r = synthesiseSeq(opts);
  process.stdout.write(
    JSON.stringify({
      found: r.frontier.map((s) => ({ parts: s.parts, depth: s.depth, circuit: s.circuit })),
      exhaustive: r.exhaustive,
      states: r.states,
    }) + '\n',
  );
});
