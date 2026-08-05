# Roadmap

Things decided but not built. Each entry says what it is, why it earns its
place, and what it would cost — so a future session can pick one up without
re-deriving the argument.

---

## Earned clues

**The problem.** Two real playtest observations pull against each other. Briefs
that spell out the construction kill the discovery — *"some level descriptions
give too much away, basically stating the solutions"* — and we rewrote them.
But getting stuck is also real: Neither took a round of "is this even
possible", and the full adder needed a circuit diagram from outside the game.
A hint system is needed. A free one would undo the brief rewrite in one click.

**The idea.** Clues are a currency. You mint them by playing well and spend
them on hints that are *derived from the solution space*, not written by hand.

### Minting

- Beat par on any metric → **1 clue**.
- Solve a level having spent no clue on it → **1 clue**.
- Failing verification repeatedly on one level → **tier 1 offered free.**

That last one is not optional. Being stuck is not the same as being lazy, and
charging a player to find out whether they are even close is a bad trade. The
floor keeps the currency from becoming a wall.

The first two rules are the point: **optimising becomes the thing that funds
progress.** Right now the three metrics are a readout — you look at them, they
change nothing. This makes them a resource without adding a leaderboard, a
star rating, or any of the other decorations we do not want.

### Spending — four tiers, escalating

| tier | what it tells you | derived from |
|---|---|---|
| 1 **Shape** | "A solution exists at 7 components and 3 ticks." | the superoptimiser's optimum |
| 2 **Structure** | "It merges two inverter outputs." / "One signal is read three times." | merge count, max fan-out, depth of the witness |
| 3 **A part** | one line of the witness netlist, e.g. `n2 = NOT(a) \| NOT(b)` | the witness itself |
| 4 **The build** | the reference solution placed on the board | `level.reference` — dev mode's `solve`, made diegetic |

Tier 1 is usually enough. Most sticking points are "am I even in the right
ballpark", and a number answers that without touching the shape of the answer.

**Why this game specifically.** Every other hint system is a writer guessing
what you are stuck on. `synth.ts` already computes the true optimum and a
witness netlist for every combinational level, so a tier-1 clue is a *measured
fact*, not an author's opinion. Tiers 2 and 3 fall out of the witness for free.
Nothing else in the codebase has this property, and it would be a waste not to
spend it.

### Cost

- Persistence: `clues: number` and `clueTier: Record<levelId, number>` in the
  existing zustand persist slice. Small.
- UI: a CLUES section in the `?` brief sheet — tier list, cost, what you have
  bought. The level card shows the tier reached, stated plainly rather than
  punitively.
- Derivation: tiers 1–3 come from `analyseLevel()`, which already runs and
  caches.

### The gap

The superoptimiser is combinational-only. **Chapter 4 onward has state, so
tiers 1–3 cannot be derived there** — those levels need authored clues, or a
search that understands sequential circuits. Same gap `docs/work/chapter4.md`
names for par. Worth solving once, for both.

---

## Make the board the binding constraint

The balance sweep says 11 of 12 levels have exactly one non-dominated solution,
and par equals the true optimum on 10 of 11. There is no trade-off to play
because nothing is scarce: boards are generous, so area never forces a
decision, and components and ticks track each other on circuits this small.

Shrinking grids makes routing the puzzle. A 7-part circuit that will not fit
loses to a 9-part one that will, and all three metrics start pulling against
each other. It costs nothing but numbers in the level table, and it is the
single highest-leverage change available.

## OR at 1×2

`OR(x, x)` is a buffer, so OR does everything BUF does at the same price and
more besides — measured, it ties on 10 of 11 levels and wins on the eleventh.
The two tools are not a choice. Making OR occupy two cells keeps the component
cost and adds an area cost, so BUF wins on area and OR wins on count. Full
argument in `decisions.md`.

## A clock makes ticks matter

Ticks are currently a number you glance at. Once a circuit has to settle inside
a clock period, depth becomes pass/fail. Chapter 4 introduces the clock anyway,
so this is nearly free — it needs the constraint stated in the level and shown
on the scope.

## Chapter 5 — display

`Kind.Seg7` and `Kind.Nixie` are in the kind table with full pin geometry and
have never been placed. Registers, then a decoder driving a seven-segment
display, is the natural chapter after memory, and it is the first time the
board shows a *number* rather than a light.
