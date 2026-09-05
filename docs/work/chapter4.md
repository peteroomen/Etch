# Chapter 4 — memory

**Built.** Four levels, three blueprints, all references verified, all pars
measured. What follows is the record of how it was decided.

## Shipped

| # | level | teaches | par | unlocks |
|---|---|---|---|---|
| 13 | **Hold** | A loop remembers. That is all memory is. | 1c / 0t | — |
| 14 | **Set and reset** | Two nodes, each holding the other down. | 2c / 1t | `srlatch` |
| 15 | **Gated** | Memory with a door on it. | 6c / 2t | `dlatch` |
| 16 | **Edge** | Two doors that are never open at once. | 13c / 5t | `dff` |

Every par is measured by running the level's own reference, and every one
matches what the superoptimiser predicted before the level existed.

## The rule the chapter runs on

A latch that is holding has no simultaneous answer — both sides of the pair
would flip together forever — so the tick rule breaks that tie by board order
(see `latches.md`). That gives every latch a REAL power-on state and never a
PREDICTABLE one.

So: **no level may assert an output value before the circuit has been set or
reset at least once.** A level that did would pass or fail depending on where
the player happened to put a gate. Edge's step 0 claims nothing at all for
exactly this reason, and a test enforces the rule across the chapter.

Hold is the exception, and it is why its reference is a BUFFER loop rather than
an inverter ring. A buffer reading its own net is not a ring: nothing drives the
node until A does, and the pull-down holds it low, so it starts low every time.
An inverter in the same loop is a two-gate bistable with no settled starting
value — which the brief now warns about, because it is the level's real lesson.

## Timelines that cannot be cheated

The search caught two chapter-4 specs where an input turned out to be
decorative: one where S was indistinguishable from EN, one where CLEAR
collapsed into ENABLE. Both would have shipped as levels that could be passed
without understanding them.

So each timeline is now tested against the thing it claims to teach:

- **Hold** cannot be passed with zero components (a bare wire).
- **Set and reset** becomes unsolvable if R is pinned low — the reset is real.
- **Gated** becomes unsolvable if EN is pinned high — the door is real.
- **Edge** cannot be passed by a single transparent latch, wired any way, at
  any cost up to six. Proven exhaustively.

That last one is the chapter's whole point, and it is the one worth having a
machine check.

## Measured costs

| level | NOT only | +BUF | +OR |
|---|---|---|---|
| Hold | 2p / 1t (unreliable — see above) | **1p / 0t** | 1p / 0t |
| Set and reset | **2p / 1t** | 2p / 1t | 2p / 1t |
| Set and reset, with q̄ | 2p / 1t — q̄ costs nothing extra | | |
| Gated (D latch) | 7p / 3t | **6p / 2t** | ≤ 6p / 2t |

Everything above is exhaustive except the OR column on Gated.

**The D latch is not the textbook one.** The textbook needs two AND terms,
`d ∧ en` to set and `¬d ∧ en` to reset, which costs about nine inverters here
once the copies of `d` are paid for. The search found one with no reset term at
all: while EN is high a BUF holds q̄ up, so `NOT(q̄)` lets go and Q follows the
set term alone; when EN falls the BUF lets go and the pair keeps what it had.
Six components, two ticks. I did not find this circuit.

**Edge has a real frontier.** Built from the 7-part inverters-only latch it is
15 components and 4 ticks; from the 6-part latch, 13 and 5. The cheaper tile
makes the slower flip-flop. That is the kind of trade the game has been short
of, and it arrived without being designed in.

## Still to build

- **Divide** — Q̄ back to D, clock in, half the frequency out. The first thing
  in the game that counts, and the natural close of the chapter.
- **Enable** — a gated SET only, measured at 5p/2t. A gentler rung between the
  2-component latch and the 6-component D latch, if the jump proves too steep
  in play.

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

## Superseded

Everything measured before the tick rule changed said Hold was impossible with
inverters alone and that latches could not compose. Both were true under
simultaneous update and are false now. `latches.md` records why the rule
changed and what it cost; the numbers above are the ones that hold.
