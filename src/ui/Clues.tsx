/**
 * Earned clues.
 *
 * Every other hint system is a writer guessing what you are stuck on. This one
 * is a search result: the model knows the true optimum and a circuit that
 * reaches it, so tier one is a measured fact rather than an opinion, and the
 * tiers above it are read off the same witness.
 *
 * Clues are a currency, minted by playing well — beat par on any metric, or
 * solve a level having spent nothing on it. That is deliberate: it makes the
 * three scores buy something instead of being a readout you glance at.
 *
 * The floor matters more than the currency. Being stuck is not the same as
 * being lazy, so enough failed attempts on one level grant its first clue
 * outright. Charging someone to find out whether they are even close would be
 * a bad trade.
 */

import { Level } from '../game/level';
import { CLUES } from '../game/clues.generated';
import { commitEdit, session } from '../state/session';
import { useUI } from '../state/store';

interface Tier {
  n: number;
  cost: number;
  name: string;
  /** null when this level has nothing to say at this tier */
  body: (l: Level) => string[] | null;
}

const TIERS: Tier[] = [
  {
    n: 1,
    cost: 1,
    name: 'How big',
    body: (l) => {
      const c = CLUES[l.id];
      if (!c) return null;
      const lines = [`Par is ${c.par.components} components and ${c.par.ticks} ticks.`];
      if (c.optimum && c.optimum.parts < c.par.components) {
        lines.push(
          `There is a smaller one: ${c.optimum.parts} components, ${c.optimum.depth} ticks.`,
        );
      } else if (c.optimum && c.exhaustive) {
        lines.push('Nothing smaller exists. Par is the best there is.');
      }
      return lines;
    },
  },
  {
    n: 2,
    cost: 1,
    name: 'What shape',
    body: (l) => {
      const c = CLUES[l.id];
      return c && c.structure.length ? c.structure : null;
    },
  },
  {
    n: 3,
    cost: 2,
    name: 'One node',
    body: (l) => {
      const c = CLUES[l.id];
      if (!c) return null;
      // the first lines are bare inputs and say nothing; show the first node
      // that actually has a component on it
      const first = c.netlist.find((n) => n.includes('('));
      if (!first) return null;
      return [first, 'The rest is yours.'];
    },
  },
  {
    n: 4,
    cost: 3,
    name: 'The whole circuit',
    body: (l) => {
      const c = CLUES[l.id];
      return c && c.netlist.length ? c.netlist : null;
    },
  },
];

export function Clues({ level, onBuilt }: { level: Level; onBuilt: () => void }) {
  const clues = useUI((s) => s.clues);
  const bought = useUI((s) => s.clueTier[level.id] ?? 0);
  const fails = useUI((s) => s.fails[level.id] ?? 0);
  const buyClue = useUI((s) => s.buyClue);

  const available = TIERS.filter((t) => t.body(level) !== null);

  return (
    <div className="clues">
      <p className="clue-purse">
        {clues === 0 ? 'No clues saved.' : clues === 1 ? '1 clue saved.' : `${clues} clues saved.`}
        <span className="dim">
          {' '}
          Earn one by beating par on anything, or by solving a level without help.
        </span>
      </p>

      {fails >= 3 && bought >= 1 && (
        <p className="clue-free">The first clue here was free — you had a few goes at it.</p>
      )}

      <ol className="clue-list">
        {available.map((t) => {
          const owned = bought >= t.n;
          const lines = t.body(level)!;
          return (
            <li key={t.n} className={owned ? 'owned' : ''}>
              <div className="clue-head">
                <strong>{t.name}</strong>
                {!owned && (
                  <button
                    className="clue-buy"
                    disabled={clues < t.cost}
                    onClick={() => buyClue(level.id, t.n, t.cost)}
                  >
                    {t.cost === 1 ? '1 clue' : `${t.cost} clues`}
                  </button>
                )}
              </div>
              {owned &&
                lines.map((line, i) => (
                  <p key={i} className="clue-body">
                    {line}
                  </p>
                ))}
            </li>
          );
        })}

        <li className={bought >= 5 ? 'owned' : ''}>
          <div className="clue-head">
            <strong>Build it for me</strong>
            <button
              className="clue-buy"
              disabled={clues < 4}
              onClick={() => {
                if (!buyClue(level.id, 5, 4)) return;
                level.reference(session.world);
                commitEdit();
                onBuilt();
              }}
            >
              4 clues
            </button>
          </div>
          <p className="clue-body dim">Puts a working answer on the board. It will not be the best one.</p>
        </li>
      </ol>
    </div>
  );
}
