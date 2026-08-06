# Roadmap

Things decided but not built. Each entry says what it is, why it earns its
place, and what it would cost — so a future session can pick one up without
re-deriving the argument.

---

## ~~Earned clues~~ — built

Shipped. `npm run clues` runs the superoptimiser over every level at build time
and bakes the answers into `src/game/clues.generated.ts`; the game reads the
table. Four tiers plus a fifth that builds it for you, minted by beating par or
by solving a level unaided, with a free first clue after three failed attempts.

The gap this entry named — *"the superoptimiser is combinational-only, so
chapter 4 onward cannot derive tiers 1-3"* — is closed. `seq.ts` searches
sequential circuits by simulation, and where even that truncates (Gated, Edge)
the generator reads a netlist off the reference build instead. Detail in the
header comments of `scripts/clues.ts` and `src/ui/Clues.tsx`.

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
