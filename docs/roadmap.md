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

## ~~Chapter 5 — display~~ — built

Shipped: seven levels from a 2-bit register to a counter driving a seven-segment
display. `Kind.Seg7` is now a real output device — its segments ARE the level's
outputs — and the board finally shows a number rather than a light. Full write-up
in `work/chapter5.md`.

## ~~Chapter 6 — decimal, and the nixie~~ — built

Shipped: six levels from a clearable latch to a ten-stage ring counter driving
the nixie. The decade counter got its state-detection lesson (ten is the only
count reachable with q3 and q1 both set, so the detector is three components),
and the chapter's spine turned out to be the TRADE between the two ways of
counting to ten — 75 components and 12 ticks in four wires, against 170 and 3
ticks in ten. Full write-up in `work/chapter6.md`.

The 4-to-10 decoder was measured at 46 components (two ticks, one-hot on every
digit) and deliberately routed around rather than built: the ring's output IS
one-hot, so it drives the tube for nothing. That decoder is still the thing
standing between here and two digits — and note that WITH it the binary route is
cheaper end to end, 121 against 170. The ring buys ticks, not parts.

## Chapter 7 — two digits, and carry between decades

The last thing before arithmetic on displayed numbers. It needs the 4-to-10
decoder chapter 6 avoided (or a second ring), and a carry from the units decade
into the tens — which is the first signal in the game that crosses between two
otherwise independent machines.

Worth checking before committing to it: at 46 components for the decoder and
170 per ring, a two-digit display is 300+ components and two 3x10 tubes on one
board. That may want a bigger idea about hierarchy — the first time a level
should perhaps place a tile the player never opens.

---

# Spin-offs

Not chapters. Things that share the engine but would be their own game.

## An analog audio game

**The idea.** The same board, the same nets, the same measured-par discipline —
but continuous voltages instead of four states, and the levels build a preamp, an
LFO, a tremolo, an overdrive, a guitar amp. Tests are waveforms and frequency
masks rather than 1s and 0s, and the output is *audible*, which nothing else in
this genre has.

**Why it is a spin-off and not chapter 9.** The substrate IS Etch. The four-state
lattice, destructive fan-in and the gate-cost inversion are what every level and
every metric are made of. Analog does not extend that, it replaces it — and
components/ticks/area is meaningless for a preamp, where the axes are gain,
headroom, noise, THD and parts count. What genuinely transfers is the *engine*:
the grid, nets-as-nodes (which is what nodal analysis already is), blueprints as
subcircuits, the timeline/scope verification structure, and the
level/reference/measured-par discipline.

**The obstacle is parameters, not physics.** Simulation is tractable. What breaks
the puzzle is that a resistor is not "a resistor", it is 4.7 kΩ — the search space
gains a continuous axis, and "tune the pot until it sounds right" is a slider, not
a puzzle. The fix is the move Etch already made once: pick a substrate where the
interesting thing is discrete. **E12/E24 values** (10, 12, 15, 18, 22, 27, 33, 39,
47, 56, 68, 82 and decades) are how parts are actually sold, so it satisfies the
map-onto-real-life rule *and* makes the value space finite.

**Cascades, not topologies.** An amp is a line: input → gain stage → tone stack →
phase inverter → power stage. That is not a spatial puzzle, so the board metaphor
loses its bite and the puzzle has to become **biasing** — getting a device into
its linear region, what the cathode resistor sets, when to bypass it, AC vs DC
coupling. Which is fine, because biasing is the actual skill, and it is what
separates understanding a schematic from copying one.

**Tolerance replaces the difficulty knob.** Losing exhaustive search costs the
measured par and the measured clues. A Monte Carlo over component tolerance buys
a new one: *"it works — does it work with 5% resistors, a hundred times out of a
hundred?"* Real engineering, and a hard pass/fail on top of a fuzzy one.

### What `peteroomen/clipper` (Tonesmith) already has

Surveyed 2026-08-06. A portable C++ DSP core (wasm + JUCE native) behind a real
guitar rig sim. Directly borrowable:

- **`TriodeStage`** — a 12AX7 common-cathode stage. Koren plate-current law,
  per-sample 3×3 nodal Newton on (plate, grid, cathode) with an analytic
  Jacobian, caps as backward-Euler companions, warm-started from the previous
  sample, iteration cap and damped fallback so a slam cannot NaN. Grid conduction
  and blocking distortion are modelled, not approximated.
- **`BjtStage`** — the same machinery with Ebers-Moll, written to be reused with a
  new Config. So there is already a two-device library sharing one numerical
  house style, and the device laws with correct analytic derivatives are the
  hard, error-prone part.
- **A DC operating-point solver** (`solveFollowerOperatingPoint`). The biasing
  puzzle's verification primitive, already written.

**The gap.** There is no generic solver. Every topology is hand-derived: the
preamp headers carry a `// Netlist (nodes IN, N2, ...)` *comment* and then the MNA
transcribed into fixed matrix code beneath it — four hand-codings of what is
structurally the same tone stack. Right for an amp sim, exactly wrong for a game,
which needs the inversion: netlist as **data**, solver generic, assembled from
whatever is on the board. That layer would have to be written. Not research, but
it is the piece that makes it a game rather than a simulator.

**The search asymmetry, which is a design lever.** Nonlinear transient sim is
cheap for one candidate and hopeless for thousands, so the superoptimiser cannot
run there. But **linear AC analysis is a complex matrix solve per frequency point
— microseconds** — so tone stacks, filters and anything graded by a frequency mask
*is* searchable over E12 values. Put the measured-par, measured-clue puzzles where
linear analysis works; use derived-analytic references where it does not. Half the
game keeps the property that makes Etch's hints honest, instead of none of it.

**The risk.** Audio is a taste domain, and near guitar amps you are adjacent to
people arguing about capacitor brands. The game has to stay strictly on measurable
claims — here is the tone stack's transfer function, here is what the bypass cap
does to the low end — and decline the mythology. Content discipline, but it is
what decides whether the thing gets respected.

### The part of this that IS in Etch's scope

A late chapter on **what a "1" actually is**: threshold, noise margin, why the
pull-down works, why an inverter is a switch. It retroactively explains the
substrate rather than contradicting it, and it is the honest answer to a player
who asks what is really on the wire.

### Worth stealing from Tonesmith regardless

Two testing habits, whether or not the spin-off ever happens:

- **Derived references.** Its tests compare a measured number against an analytic
  target computed *independently inside the test* — bisection on the load line,
  central-difference small-signal parameters, a complex transfer function for the
  cathode shelf. "Pin the SOLVER against the physics, not against itself." Same
  rule as par being measured rather than typed. ADR 008 there is the cautionary
  tale: a device constant silently defaulted, and then a second constant fitted to
  agree with the error.
- **Perturbation testing as doctrine.** Break the model N ways, confirm all N go
  red, confirm every restore goes green — and name the bars that *could not* fail.
  `chapter5.test.ts`'s "every input changes the answer" is an ad-hoc version of
  this; making it a habit would have caught the two chapter-4 specs where an input
  turned out to be decorative.
