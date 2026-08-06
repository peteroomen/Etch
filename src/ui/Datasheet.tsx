/**
 * The rules of the substrate, one tap from any level.
 *
 * Every one of these is stated somewhere in chapters 1 and 2 — once, in a brief
 * read before it mattered, and then gone. By chapter 4 a player needs four of
 * them at the same time. The problem was never that they went unsaid, it was
 * that they were not there when needed.
 *
 * Kept deliberately short. A reference nobody reads is worth nothing, and the
 * temptation with a page like this is to explain rather than remind.
 */

const RULES: { head: string; body: string }[] = [
  {
    head: 'A wire is one node',
    body: 'Everything joined together is the same signal, at the same instant. Wire has no delay and no direction.',
  },
  {
    head: 'Nothing drives a wire LOW',
    body: 'A driver either pulls a wire HIGH or lets go of it. A wire is LOW only while every driver has let go.',
  },
  {
    head: 'Joining is free, and permanent',
    body: 'Join two signals and you get one, HIGH when either was HIGH. It costs nothing. You cannot tell them apart again.',
  },
  {
    head: 'Reading is free',
    body: 'Any number of components can read the same node without changing it, and without paying for it.',
  },
  {
    head: 'Only components take time',
    body: 'One tick each, whatever they do. Wire is instant, however long you make it.',
  },
];

const NOTATION: { term: string; body: string }[] = [
  { term: 'Q', body: 'An output that holds a value.' },
  { term: '/Q', body: 'Q inverted — HIGH whenever Q is LOW. A circuit that holds a value usually makes both.' },
  { term: 'D', body: 'The value to store.' },
  { term: 'EN', body: 'Enable. While it is HIGH the circuit is listening.' },
  { term: 'CLK', body: 'A clock: a signal that goes HIGH and LOW over and over.' },
];

export function Datasheet() {
  return (
    <div className="datasheet">
      <ol className="rules">
        {RULES.map((r) => (
          <li key={r.head}>
            <strong>{r.head}</strong>
            <span>{r.body}</span>
          </li>
        ))}
      </ol>
      <h3>Names</h3>
      <dl className="notation">
        {NOTATION.map((n) => (
          <div key={n.term}>
            <dt>{n.term}</dt>
            <dd>{n.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
