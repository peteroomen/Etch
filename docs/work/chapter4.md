# Chapter 4 — memory

Every number in this document is **measured**, by exhaustive search over the
same synchronous update the game uses. Where a search ran out of budget it says
so rather than rounding to a claim.

## Resolving the superoptimiser

`synth.ts` builds nets in topological order. That makes every circuit it can
express a DAG — a fine model of combinational logic and a total blind spot for
memory, because **a latch is a cycle**. It could not represent one, let alone
cost one.

`seq.ts` drops the ordering constraint: a part may read any net, including the
one it drives. What replaces the truth table is simulation — every candidate is
run against the level's actual timeline, tick for tick, with the same
read-everything-then-commit-everything update `world.ts` uses.

That equivalence is the whole point, so it is tested rather than asserted:

- On problems both searches can express, they agree exactly — NOR 1p/1t,
  NAND 2p/1t, AND 3p/2t.
- The search's own SR latch witness, **built as a real board and run through the
  real simulator**, gives the same output trace and the same worst-case tick
  count the model predicted.
- Both agree that releasing S and R together oscillates.

The cost of dropping the DAG is that behaviour is no longer a 32-bit truth
table, so the dominance memo that makes the combinational search fast does not
apply. What replaces it is **canonical net labelling**: net indices are
arbitrary, so requiring first mention in index order keeps one labelling of each
shape and discards the other (n−1)!. It is a prefix property, so it prunes the
tree rather than filtering leaves. That single change took the SR latch from
4M states truncated to 262k states exhaustive, and it is what makes the D latch
answerable at all.

## The constraint that shapes the chapter

Simultaneous update means **a symmetric feedback loop never settles.** Two
inverters in a ring is a bistable in silicon, where mismatched delays break the
tie; here both flip together, forever. The verifier already reports this
honestly — *"This oscillates — it never settles"* — so the trap teaches.

Consequence: **every sequential timeline must open with a step that forces a
state.** Step 0 asserts R. That is not a workaround, it is what real hardware
does at power-on, and it is visible on the scope.

## Measured costs

| level | inputs | NOT only | +BUF | +OR | verified on a board |
|---|---|---|---|---|---|
| **Hold** | a | **impossible** (exhaustive ≤6) | **1p / 0t** | 1p / 0t | — |
| **Set and reset** | s, r | **2p / 1t** | 2p / 1t | 2p / 1t | yes — same trace, same ticks |
| Set and reset **+ q̄** | s, r | 2p / 1t | — | — | q̄ costs nothing extra |
| **Enable** | s, en, r | **5p / 2t** | 5p / 2t | — | — |
| **Gated (D latch)** | d, en | **impossible** (exhaustive ≤7) | **6p / 2t** | ≤ 6p / 2t | yes — 6 components, 2 ticks |

Every "impossible" above is an exhaustive result, not a budget timeout.
The one open cell is whether OR can beat 6 on the D latch; that search truncated
at 300M states. OR reaches 6 by substituting `OR(en,en)` for the BUF, checked
directly.

### Three findings worth the build

**1. Hold cannot be done with inverters alone.** Exhaustively proven to six
parts. Every candidate either oscillates or fails to hold. So Hold is the first
level in the game where the substrate *provably* needs something beyond the
inverter — a much stronger curriculum beat than "here is a new part". It also
scores 1c/0t: zero ticks, because the source drives the output net directly and
the memory only shows itself after the input lets go.

**2. The D latch the search found is not the textbook one.**

```
n2 = NOT(d) | NOT(en)      NAND — the set term, active low
n3 = NOT(n2) | NOT(n4)     Q
n4 = NOT(n3) | BUF(en)     Q̄, forced high while EN is high
```

The textbook build needs two AND terms — `S = d ∧ en` and `R = ¬d ∧ en` — which
in this substrate costs about nine parts once the copies of `d` are paid for.
This one has **no reset term at all**. While EN is high the BUF holds Q̄ up, so
`NOT(n4)` lets go and Q is decided purely by the set term; when EN falls the BUF
lets go and the cross-coupled pair keeps what it had. Six parts, two ticks,
confirmed on a real board.

I did not find this circuit. The search did, and it is exactly the kind of
result that justifies having built one.

**3. The search is also a level validator.** The first "Enable" spec had a
**two-part** solution that ignored the S input entirely — because no step in the
timeline had EN high with S low, so S was decorative. The model found the cheat
in 0.1s. Adding one discriminating step moved the true cost to 5p/2t.

This is a capability the combinational search never had a use for and this one
does: *does the level's test actually pin down the behaviour it claims to
teach?* Every sequential timeline should be run through it before shipping.

## The levels

### 13. Hold — 1 component
*A component that reads its own output keeps it alive.*

Q goes HIGH the first time A does, and stays HIGH after A drops. No reset.

- palette: wire, not, buf
- par: 1c / 0t
- **inverters alone cannot do this**, which is the point — the level teaches
  that the loop must not invert
- unlocks: nothing; the shape is the lesson, not the part

### 14. Set and reset — 2 components
*Two nets, each holding the other down.*

Q goes HIGH on S, LOW on R, holds when both are low. Require q̄ as well: it
costs nothing and it makes the symmetry visible.

In this substrate **you never build the NOR** — the merge *is* its input stage,
because joining is destructive. S shares a net with the feedback, so Q is read
off the S net exactly as an open-collector latch behaves.

- palette: wire, cross, not
- par: 2c / 1t
- timeline opens with R asserted
- unlocks: `srlatch`

### 15. Enable — 5 components
*A latch you can only set when you are allowed to.*

S sets Q, but only while EN is high. R resets regardless. The AND fuses into
the latch rather than stacking on top of it.

- palette: wire, cross, not
- par: 5c / 2t
- the step where EN is high and S is low is load-bearing; without it the level
  has a two-part cheat
- unlocks: `enlatch`

### 16. Gated — 6 components
*Memory with a door on it.*

Q follows D while EN is HIGH and holds whatever it had when EN drops.

- palette: wire, cross, not, buf, srlatch
- par: 6c / 2t
- **impossible with inverters alone** (exhaustive to 7 parts), so BUF or OR is
  required — the second level where the palette is a necessity, not a shortcut
- unlocks: `dlatch`

### 17. Edge *(unmodelled)*
*Two doors that are never open at once.*

Master and slave on opposite phases, so Q changes only on a rising edge. This is
why a clocked machine works at all: one transparent latch in a feedback loop
races itself, two out of phase do not.

Two D latches is 12+ parts, past what the search can enumerate directly. Par
comes from the reference build, flagged unverified, unless the search grows a
way to compose known blocks.

### 18. Divide *(unmodelled)*
*The first thing in the game that counts.*

Q̄ back to D, clock in, half the frequency out. Needs
`advance: { mode: 'ticks' }` — a divider is never meant to settle, so "settle"
is the wrong question to ask it.

## What is still open

- **Composition.** The search enumerates primitives. Levels 17–18 are built from
  blocks the player already owns, and costing those means letting the search
  place a known blueprint as a single move. That is the same feature the roadmap
  needs for tier-1 clues above chapter 3.
- **Area.** Still invisible to both searches — it needs placement and routing,
  so it is only ever measured from the reference.
