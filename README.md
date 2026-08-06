# Etch

**Build a computer out of inverters.**

A touch-first circuit puzzle game. There is no AND gate until you make one, and
the thing you make is the thing you get.

```
npm install
npm run dev        # play at localhost:5173
npm test           # sim, gate ladder, and every level's solvability
npm run build      # typecheck + production build
```

---

## The substrate

One decision shapes everything else, so it is worth stating plainly.

**Wires are drawn but resolve instantly.** Connected wire cells are a single
electrical node. There is no propagation delay in wire — all delay lives in
placed components, one tick each. This is not a cellular automaton, deliberately:
a CA substrate charges a clock for every AND gate, and that tax lands on the
player in their first hour.

**Nothing drives a net low.** Every driver either pulls a net HIGH or lets go,
and each net carries a weak pull-down that supplies the zeros. Nets resolve on a
four-state lattice — `Z`, `0`, `1`, `X` — with strong and weak drivers.

Two things fall out of that, and they are the game:

**OR is free.** Drive one node from two places and it reads HIGH when either
driver pulls it high. No component, no tick. Wired-OR isn't a special case in the
resolver, it is just what the resolver does when nothing can pull low.

**Joining consumes.** Merging two nets destroys the operands — they stop existing
separately. Fan-*out* is free; any number of components can read a node. Fan-*in*
is what costs.

There are two ways to pay. **BUF** makes an independent driven copy of a signal.
The **OR component** reads both its inputs instead of merging them. Both cost one
component and one tick, and neither dominates the free merge — so joining is a
priced choice rather than a dead end.

The rule of thumb: **merge inverter outputs, never source nets.**

### Gate costs come out inverted

| gate | build | cost | destroys its inputs? |
|---|---|---|---|
| NOR | join a,b then invert | 1 inverter, 1 tick | **yes** |
| NAND | invert both, join the outputs | 2 inverters, 1 tick | no |
| AND | NAND then invert | 3 inverters, 2 ticks | no |
| XOR | `(a ∧ ¬b) ∨ (¬a ∧ b)` | 6 components, 2 ticks | no |

NOR cheapest, AND dearest — inverted from CMOS intuition, because gate cost is a
property of the technology rather than of the truth table. This ordering is not
invented: it is what NMOS gives you, where parallel pull-downs make NOR the
natural primitive. NAND-is-cheapest is a CMOS artifact, not a law. Chapter 2 is
ordered by ascending cost so the player discovers that rather than being told.

### The textbook XOR is dominated, not forbidden

`XOR = (a∨b) ∧ ¬(a∧b)` is worth following carefully, because what happens to it
depends on what you are holding.

With wire and inverters alone it genuinely cannot be transcribed: the only way
to make `a∨b` is to merge, and merging destroys the `a` and `b` the other half
still needs. XOR remains buildable — a copy is two inverters back to back — but
only in a rearranged form, at **8 components and 3 ticks**.

Once you have an OR gate the formula transcribes literally, because an OR gate
*reads* its operands instead of consuming them. Measured: **6 components, 3
ticks**, correct on every row. The substrate-native form is **6 and 2**.

So the textbook answer is never wrong here, and stops being impossible the
moment you own an OR gate. It is *dominated*, by exactly one tick. That is the
better lesson: a formula is a claim about logic, and its price is a claim about
the technology you build it in.

## Drawing

Wire is laid like a road, not sketched. A drag commits to the axis it set off
along and turns once; the corner lands where you expect rather than flipping
under your thumb. When a straight elbow is blocked it routes around, on a
Dijkstra over (cell, heading) that charges for corners — same length with fewer
turns is a better wire, and far easier to read. A drag can start and finish on a
component terminal. The eraser stays freehand, because you want that one to
follow your finger exactly.

## Scoring

Three metrics in genuine tension, no stars:

- **components** — primitives placed, counted *through* blueprints
- **ticks** — propagation depth, worst case across the timeline
- **area** — cells you authored

You cannot minimise all three. Fewer components usually means longer routing;
shallower logic usually costs more inverters. Cost is never hidden inside a
blueprint — a wrapped AND still bills three inverters.

## Verification

A level's test is a **timeline**, not a bag of vectors. Every signal has a value
at every step, so the verification panel plots required against actual and marks
the first divergence. A circuit that never settles fails as *"this oscillates"*
rather than as a wrong answer.

Par is **measured, never typed**: every level ships a reference solution that the
test suite plays headlessly, and par is whatever that scores. A hand-written par
is a hand-written bug.

## Layout

```
src/sim/       the simulation — pure TypeScript, no React, no DOM
  values.ts      the four-state lattice and its resolver
  grid.ts        cell packing, kinds, masks
  nets.ts        flood-fill extraction, pin binding
  blueprint.ts   flattening, with host-net aliasing
  world.ts       components, the tick loop, undo
  draw.ts        editor policy: what a stroke authors
src/game/      content — blueprints, levels, the level format
src/render/    canvas renderer and the palette tokens
src/state/     the world (a module singleton) and Zustand UI state
src/ui/        React shell, the verification scope
```

**The grid never enters React state.** It lives in `state/session.ts` as a plain
module singleton; React learns something changed through a revision counter the
render loop polls. Putting a few thousand cells behind a reducer would re-render
the tree on every tick.

## Balance

`npm run balance` regenerates `docs/balance.md` by exhaustively searching each
level's real solution space. It reports the true optimum, how much headroom par
leaves, what each level's new tool actually saves over inverters alone, and
whether a level has a genuine components-against-ticks trade-off or one dominant
answer. Personas are search policies, not simulated players.

It has already been worth it: it falsified the claim that XOR was impossible
without BUF, and it found that the metrics only start trading against each other
at the half adder.

## Docs

- `docs/decisions.md` — every load-bearing call and why it went that way
- `docs/balance.md` — the measured difficulty curve, regenerated by `npm run balance`
- `docs/work/` — phase plans

## Status

Chapters 1–3 playable end to end: twelve levels, wire through full adder, with
progression, unlocks and persistence. Sandbox unlocked. 159 tests, plus the
balance model.

Not yet built: the blueprint authoring UI (unlocks are real blueprints under the
hood, but granted automatically), sequential levels, the seven-segment and nixie
displays, PWA packaging, share codes.
