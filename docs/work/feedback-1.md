# Playtest round 1 — collated

First real play session through chapters 1–3. Overall verdict was positive, the
difficulty curve landed, and the full adder "kicks me in the teeth, perfect".
What follows is everything raised, with root causes where I found them.

---

## 1. Bugs, with causes found

### The free board shows the wrong palette and has no I/O — **root cause found**
Reported as "can't place I/O, or control the ios". It is worse and simpler than
that: **entering the sandbox never clears `levelId`**. `App` derives the level
from that id, so the sandbox renders the *previous level's* palette, brief,
verification panel and par, over a world that has no pins at all. Confirmed by
driving it — the sandbox came back with the palette `WIRE ERASE PROBE NOT`,
which is Neither's.

Two fixes, both needed:
- clear `levelId` when entering the sandbox
- give the sandbox a real palette **including placeable IN and OUT pads**, so a
  free board can have inputs and outputs at all

### Switch toggles are lost on every edit — **root cause found**
`rebuild()` constructs fresh `Component` objects with `state: 0`, and only
sources with a level pin name get their state restored from `world.inputs`. A
sandbox switch has no pin name, so every edit silently resets it. Needs the same
treatment as `pinNames`: persist switch state by cell.

### Probe "doesn't work" — **not reproducible at HEAD**
It draws `NET n · value · k drivers` and outlines every cell on the node;
captured working. It landed in `7f8f267`, so the deployed build is probably
behind or the bundle was cached. Worth a hard refresh before I chase it.

Regardless, two things make it easier to find: mirror the readout into the
palette hint strip (always on screen), and report something when you probe a
cell that is on no net, instead of silently doing nothing.

### The grid is too small on a phone
Measured: a 12-wide level gets 32px cells at 390px, which is fine. An 18-wide
level — XOR, the full adder — gets **21px**, below the 24px thumb minimum this
was supposed to hold. `fitViewport` shrinks to fit the whole board.

Fix: stop fitting. Hold a floor of ~28px, let the board overflow, and let
pan/pinch handle the rest. Bigger levels should need panning; that is what the
gesture is for.

---

## 2. Legibility

### Which side of a gate is input and which is output
Reported as: *"I had no idea that's how the gates worked, assuming it was
top/bottom in east out when facing east."* That is a completely reasonable
reading and the game never says otherwise. The placement ghost now shows pin
sides, but a **placed** component still only hints at its facing through a small
glyph.

Fix: mark pins on placed components permanently — inputs and outputs visually
distinct, not just present.

### Some briefs give the solution away
Named directly. Chapter 2's briefs in particular state the construction rather
than the goal. They should give the objective and the constraint, and let the
player find the shape. The XOR brief currently spells out
`(A AND NOT B) OR (NOT A AND B)`, which is the answer.

---

## 3. Missing features, in the order they were asked for

1. **Clear the board / start over.** No way to do it short of erasing by hand.
2. **Animate the whole circuit during verification**, not just report a verdict —
   plus during RUN.
3. **Step**, to advance to the next I/O state rather than free-running.
4. **Clocks and latches.** Chapter 4 material; the sim already supports both
   (the SR latch is tested), they just have no levels or palette entries.

---

## 4. Design notes — recorded, not acted on

### The OR-size lever
Making OR two cells turns its dominance over BUF into an area-against-count
trade-off. Confirmed as a lever to keep in hand, not to pull yet.

### Gate access should sometimes be restricted
Observed that AND and XOR make later levels easy — the adder becomes "two gates
and some wires" — but that it still *feels earned* as long as difficulty steps up
again afterwards. This is exactly what palette gating is for, and it is worth
being deliberate rather than accumulative about which levels get the full
cupboard.

### The three-metric system — **now measured**
The concern: in practice only area varies, because the ideal component and tick
counts get found immediately.

**That is confirmed, from both directions.** The netlist model already showed ten
of eleven levels have a single non-dominated (components, ticks) pair. And a new
Monte Carlo layout sampler (`src/model/layout.ts`, `npm run area`) now measures
the third axis by scattering parts, routing them, and keeping the layouts that
verify:

| level | reference area | sampled range | median |
|---|---|---|---|
| Invert | 10 | 10 – 18 | 14 |
| Neither | 18 | **12** – 21 | 16 |
| Not both | 24 | **20** – 39 | 30 |
| Both | 26 | **24** – 57 | 36 |

Two things fall out.

**Area is not decoration — it is a wide, live optimisation.** `Both` ranges 24 to
57 across working layouts, more than a factor of two.

**And the reference is not optimal on it.** Random placement beat my
hand-authored area par on three of four levels — Neither by 33%. So area par is
loose, which matches beating it by 3 on the half adder.

The honest conclusion is that Etch currently has **one puzzle and one
optimisation**: find the circuit (which has a single right answer nearly
everywhere), then golf the routing. That is a real game — it is Opus Magnum's
area metric — but it is *not* the Zachtronics three-way tension, and calling it
that oversells it.

Three ways to earn the third axis, if we want it:
1. **Bigger, looser levels** so routing has genuine alternatives.
2. **Levels with shared sub-expressions**, which is the only thing that has
   produced a real frontier so far (the half adder, 7p/3t ↔ 9p/2t).
3. **Accept it and say so** — present area as the score and components/ticks as
   constraints to meet, which is honest and simpler.

Caveat on the method: the sampler is Monte Carlo, not exhaustive, and its hit
rate collapses on larger circuits (1 of 300 for Copy). A reported range is a
lower bound on the variation, never a minimum.

---

## 5. Proposed order

Bugs that block play, then legibility, then features.

1. sandbox `levelId` + placeable IN/OUT pads + persistent switch state
2. cell-size floor with panning
3. pin markers on placed components
4. clear-board action
5. verification animation + step-to-next-state
6. brief rewrites that stop giving away solutions
7. chapter 4: clocks and latches
