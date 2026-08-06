# Latches, and the update rule that makes them work

Chapter 4 was blocked: latches worked alone and would not compose. The cause
was the update rule, and the fix is a narrow change to it. This is the record
of what was measured.

## Why latches would not compose

Four facts, individually fine and jointly fatal:

- **Nothing drives LOW.** Every driver pulls high or lets go, and a weak
  pull-down supplies the zeros. Everything good about the game comes from this.
- **So power-on is all-zero** — the most symmetric state there is. Every
  inverter sees a low input and fires at once.
- **Resettable memory needs an inverting loop.** A non-inverting self-hold
  (`n = a | BUF(n)`) powers on cleanly but can never be pulled back down,
  because nothing drives low. Only a cross-coupled pair can be reset.
- **A cross-coupled pair is symmetric, and update was simultaneous.** Both
  sides fire together, rise together, let go together, forever. Real hardware
  breaks the tie with mismatched delays; simultaneous update preserves it.

Standalone latches passed only because their timelines happened to open with an
input asserted, breaking the tie from outside. A master-slave cannot do that —
its two enables are complements, so one latch is always disabled at t = 0.

## The four rules, measured

| | simultaneous | ordered | seeded | **tiebreak** |
|---|---|---|---|---|
| two-inverter ring, cold | OSCILLATES | settles | settles | **settles** |
| four-inverter chain (depth 4) | 4 ticks | **1 tick** | 4 ticks | **4 ticks** |
| same chain, reversed layout | 4 ticks | 4 ticks | 4 ticks | **4 ticks** |
| AND (depth 2) | 2 ticks | **1 tick** | 2 ticks | **2 ticks** |
| XOR (depth 2) | 2 ticks | **1 tick** | 2 ticks | **2 ticks** |
| D latch, powers on unaided | OSCILLATES | wrong | wrong | **correct, 2t** |

- **simultaneous** — every part reads, then every net commits. Ticks measure
  true logic depth. Symmetric loops can never break their own tie.
- **ordered** — parts update one at a time in board order. Fixes the ring, but
  a chain laid out *along* the scan propagates in ONE tick and the same chain
  laid out against it takes four. Ticks stop measuring depth and start
  measuring layout. AND and XOR both collapse from 2 to 1. It also failed to
  produce a working latch when re-searched under its own rules.
- **seeded** — one ordered pass at power-on, simultaneous after. Keeps depth,
  fixes the ring, but a latch can re-enter the symmetric state later, so the
  master-slave still hangs.
- **tiebreak** — simultaneous, until the state is caught repeating with
  **period 2**. That is what a symmetric loop does and what nothing else does,
  so one ordered pass breaks it and simultaneous update resumes.

## The decision: tiebreak

It is the only rule that gets everything:

- **Every existing tick par is untouched.** A circuit with a fixed point never
  reaches the tie-break, so nothing in chapters 1–3 changes. Verified: NOR 1,
  NAND 1, AND 2, XOR 2, four-chain 4 — identical to today, and identical
  whichever way the chain is laid out.
- **A D latch now powers on unaided and correct, in two ticks.** Under every
  other rule that was impossible; under simultaneous it was proven impossible
  exhaustively.
- **It is honest about what it models.** Only circuits with no simultaneous
  answer get decided by board order — which is precisely what mismatched gate
  delays decide in real hardware. The game is not inventing a resolution, it is
  admitting that a symmetric race has to be resolved by something.

Full ordered update was the intuition and it is nearly right; it just pays for
the fix with the metric the whole game scores on. Tiebreak buys the same fix
and pays nothing.

## Still open

The master-slave built from the 6-part D latch now **settles** under tiebreak
but computes the wrong function. That is no longer a substrate problem — it is
a circuit problem, and a well-posed one: the latch was found by a search
assuming simultaneous rules, so chapter 4's blueprints should be re-searched
under tiebreak before any of them ship.

## Landed alongside this

- **Blueprint cycles work.** `flattenBlueprint` let the last pin on a shared
  internal net overwrite the first, so an SR latch — whose S and Q pins are
  deliberately the same node — silently lost its R input when q̄ was unwired.
  Fixed, with four regression tests.
- **Tiles are moves the search can make**, billed at flattened primitive count.
  This is what makes levels built from owned blocks costable, and it has
  already caught two broken level specs: one where S was decorative, one where
  CLEAR collapsed into ENABLE.
