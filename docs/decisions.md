# Settled decisions

Each entry is a call that is expensive to reverse, with the reason it went that way. Add to
this file rather than relitigating in chat.

---

### The substrate is not a cellular automaton
Wires are drawn cell by cell and look like Wireworld, but connected wire cells form a net that
resolves **instantaneously**. All delay lives in placed components. A CA substrate charges a
clock for every AND, and that tax would land on the player in their first hour.

### The floor is the inverter, not NAND and not the transistor
Primitives are the **inverter** and the **junction**. NOT alone is not functionally complete —
inverters and wires get you inverter chains and nothing else — so the junction does the work:
it merges nets, and a net resolves as the OR of its drivers. NOT plus OR is NOR, which is
complete. The player's first real puzzle is `AND(a,b) = NOT(NOT a ∨ NOT b)`: three inverters
and a junction, with De Morgan arriving as a discovery rather than a lecture.

Rejected: a NAND floor, because the opening primitive would arrive unexplained. Rejected:
opening on transistors, because the first hour would go on floating nets and short circuits
before blueprints exist to tame the component count.

### Nets resolve on a 4-state lattice from day one
`{Z, LO, HI, X}` with strong and weak drivers, even though Tier 1 gameplay is pure boolean.
The inverter drives strong `HI` or nothing; every net has a weak pull-down. Wired-OR then falls
out of the resolver instead of being a special case, and contention is unreachable, so `X` and
`Z` stay invisible.

This is what keeps a transistor chapter possible. NMOS introduces strong `LO`, contention
becomes reachable, and the short circuit appears — with no resolver rewrite and no save
migration. Costs roughly forty lines now; costs a format migration and thirty levels of
regression if retrofitted later. Whether that chapter is ever built is undecided and does not
need deciding.

### Consequence: OR is free
A junction is zero components and zero ticks, so OR costs nothing and everything else costs
inverters. That is a coherent universe — it is roughly resistor-transistor logic — but it means
an "OR gate" unlock is cosmetic rather than earned. Accepted.

### Wires that touch do not join
Crossing is the default; joining requires an explicit `junction` cell. The handoff proposed the
inverse (explicit bridge to cross). Inverted because on a phone, redrawing across existing wire
is constant, so the forgiving default should be the common accident. Ending a stroke *on* a
wire is usually deliberate, so that case auto-inserts a junction.

### Blueprints flatten at placement, and delay is honest
Placing a blueprint appends its primitives to the flat component list; the tick loop never sees
hierarchy. An AND made of three inverters costs 2 ticks forever.

This makes `par.ticks` measure real logic depth, which is the point of scoring it, and it buys
the best late-game loop available: re-implementing a blueprint re-flattens every instance, so
improving your adder speeds up every circuit that contains one. Solved levels keep their
recorded solve; the sandbox updates.

### Unlocks are blueprints
Building a component is what grants it. The handoff's static `allowed: Kind[]` palette gating
still exists for level constraints, but progression proper is the player's own blueprint
library. This is the core mechanic, not a feature.

### The campaign ends at a program driving a display
ALU, register file, program counter, instruction decoder, then RAM, then output. The finish is
the player's own CPU driving the monitor or nixies.

### RAM becomes a primitive after you build one
Nobody hand-places 32,000 latches. The player builds a small register file by hand, proves the
idea, and then RAM unlocks as a primitive with a size dial. Same pattern as gates, one tier up.

### Buses are an editor affordance, not a sim feature
A bundle is one stroke that lays down N parallel wires. The simulation stays single-bit and
never learns what a bus is. Seven-segment decoding (7 lines) and nixie one-hot decoding
(10 lines, historically a 74141) are good puzzles precisely because the wires are individual —
the bundle only saves drawing time.

### Stack
Vite + TypeScript, Canvas 2D, Zustand for UI state only, Tailwind for chrome, PWA, localStorage
first. **The grid never enters React state.** No physics engine, no ECS, no game framework.

### Scoring is three metrics in tension, not stars
North star is Zachtronics. Their engine is not a threshold you clear, it is
**components / ticks / area**, three numbers you cannot minimise simultaneously,
plus a histogram showing where your solution sits.

Etch's three fall out of the sim for free:

| metric | is | tension |
|---|---|---|
| **components** | primitives placed, counted through blueprints | fewer inverters usually means longer routing |
| **ticks** | propagation depth, worst case across the test vectors | shallower logic usually costs more inverters |
| **area** | player-authored cells, bounding box | compact routing forces crossovers and detours |

Cost cannot be hidden inside a blueprint: a wrapped AND still bills three
inverters. Stars are dropped — a solve reports three numbers against your own
previous best and against the reference solution, and improving one at the cost
of another is the game.

No backend, so no global histogram. Local history plus the reference mark on
each axis gets most of the value; a shared histogram is a later Supabase job.

### Par is measured, never hand-written
Every level ships a reference solution, and the harness derives its par by
running it. A hand-typed par is a hand-typed bug — I got XOR's wrong in the
first draft of the plan by reasoning about depth in my head.

### The register is a datasheet
Zachtronics ships manuals; Etch's briefs read as component specification sheets
— pin tables, truth tables, tight technical prose, no cheerleading. The tone is
dry and assumes the player is capable. This is also the artifact style already
used to pitch the art direction, so the game and its documentation match.

### Joining is destructive, and that is the substrate's signature lesson
Wired-OR means the only way to OR two signals is to merge their nets — and a
merge consumes its operands. They stop existing separately.

Fan-*out* is free: any number of components can read a net. What costs is
fan-*in*. A signal that must feed two different merges needs an independent
driven copy for each, and a copy is a BUF (one component, one tick) or two
inverters.

The rule of thumb that falls out: **merge inverter outputs, never source nets.**
That is why the gate ladder works out as it does —

| gate | build | destroys its inputs? |
|---|---|---|
| NOR | join a,b then invert | **yes** — 1 inverter, and a,b are gone |
| NAND | invert both, join the outputs | no — 2 inverters |
| AND | NAND then invert | no — 3 inverters |

And it is why `XOR = (a∨b) ∧ ¬(a∧b)` is **not constructible as written**:
computing `a∨b` destroys the a and b the NAND still needs. The cheapest XOR
here is `(a ∧ ¬b) ∨ (¬a ∧ b)` with a buffered copy of each input — 2 BUF plus
4 inverters, 6 components, 2 ticks.

So chapter 2 gains a level. **Copy** sits between AND and XOR: produce two
outputs that each merge a shared input, which is impossible until the player
discovers BUF. It is the substrate teaching its own constraint, rather than a
puzzle borrowed from another game.

**Risk, flagged honestly.** This is the call most worth revisiting in the
morning. Making the junction an ordinary 1-tick OR component instead would make
fan-in free and every circuit conventional and cheaper — XOR drops to 3
components — at the cost of the wired-OR elegance and the free OR. It is
cheap to change now and expensive after thirty levels exist.

### Blueprint pins may alias, and placing one merges host nets
A NOR blueprint has two input pins that are internally the same net. Placing it
therefore has to union the two host nets it faces — which is correct and
visible: the two wires feeding a NOR light as one node, showing the player that
the gate consumed them. Flattening runs union-find over host nets before the
net table is built.

### Non-destructive joining is added alongside, not instead
Revisiting the flagged risk. Replacing wired-OR with a 1-tick OR component was
measured, and it makes the whole game **more** expensive, not less:

| | wired-OR | OR as the only join |
|---|---|---|
| OR | 0 comp, 0 tick | 1, 1 |
| NOR | 1, 1 | 2, 2 |
| NAND | 2, 1 | 3, 2 |
| AND | 3, 2 | 4, 3 |
| XOR | 6, 2 | 7, 4 |
| 4-bit adder | 72 | 88 |

Free OR is worth a great deal, and paying a tick of depth per gate to get the
textbook XOR formula back is a bad trade. (An earlier note claiming XOR would
drop to three components was wrong — that would need primitive AND and OR, a
different change entirely.)

So both exist. **Merging stays free and destructive. The OR component costs one
component and one tick and reads its inputs instead of consuming them.** Neither
dominates: merge when you are finished with the operands, gate when you are not.

The Copy level now has two solutions at identical cost — two BUFs or two ORs,
both four components and two ticks — which is a better lesson than a single
forced answer. The wall becomes a priced choice.

OR is 1x1 and rotatable, with inputs on opposite faces and the output on a
third, because a gate whose operands are interchangeable should not favour one
of them geometrically.

### Wire arms are drawn from connectivity, not from the authored mask
The "legs" bug. A junction is stored with no mask — electrically it accepts from
every side — so drawing it from its mask put a stub on all four faces, including
ones joined to nothing. Crossovers had the same fault, and so did wire pointing
at a component with no pin on that face.

The renderer now asks, per direction, whether anything at the other end actually
faces back: wire-family neighbours by their effective mask, components and
blueprint instances by their pin list. A plain wire keeps arms running into
empty board — the player drew those and a dangling end should look dangling —
and loses only the ones aimed at something that does not connect.

### The fan-in wall is price, not possibility
Corrected by the balance model, which searched the space exhaustively rather
than taking my reasoning for it.

A copy does not require BUF. Two inverters back to back are a copy, and they
were always available. So every level is solvable with inverters and merging
alone — the newer tools just make it cheaper:

| level | inverters only | with BUF or OR |
|---|---|---|
| Copy | 5 components, 3 ticks | 4 and 2 |
| XOR | 8 components, 3 ticks | 6 and 2 |

The level briefs said "two ways out" where the honest line is "here is a third,
and it costs more". They now name the price.

#### Correction: the textbook formula is not impossible either

This section used to end by claiming `(a∨b) ∧ ¬(a∧b)` is "genuinely not
constructible", because computing `a∨b` consumes the operands the other half
needs. That was written before the OR gate existed and was never revisited.

An OR gate *reads* its operands instead of consuming them, so the formula
transcribes literally. Measured by simulation:

| route | cost |
|---|---|
| textbook, `a∨b` by an OR gate | 6 components, 3 ticks, correct |
| textbook, `a∨b` by BUF copies | 7 components, 3 ticks, correct |
| textbook, `a∨b` by merging | impossible — the merge eats the operands |
| substrate-native `(a∧¬b) ∨ (¬a∧b)` | 6 components, 2 ticks |

So the true claim is narrower and more interesting: the formula is
untranscribable **in chapter 1's vocabulary**, and from Copy onward it is merely
*dominated* — same component count, one tick slower.

That is the better teaching moment, and it generalises. A formula is a claim
about logic; what it costs is a claim about the technology you build it in. The
game should let the standard design work and make the native one the reward,
not forbid the standard one and call the substrate physics.

### The metrics only start trading at the half adder
Ten of the eleven searchable levels have exactly one non-dominated solution, so
components, ticks and area cannot be played against each other there — the score
is a target, not a choice. The half adder is the first level with a real
frontier: **7 components / 3 ticks ↔ 9 / 2**, spend two to save one.

That is expected for small teaching levels and it is a warning about the later
ones. If chapter 4 lands and its levels also have a single dominant answer, the
three-metric model is decoration and should be cut back to one.

Par sits at the tick-optimal end of the half adder's frontier (9c/2t), so its
apparent two-component "headroom" is not sloppiness — it is the trade-off doing
its job.

### Pins that touch are connected
Found by playtesting: an inverter pressed straight against the output pad did
not work. A pin binds through a NET, and a net needs at least one wire cell to
exist, so two components abutting each other had nothing to share — while the
renderer drew their stubs meeting. The picture was lying about what was joined,
which is the same failure as the junction legs and cost an evening.

Touching pins now get a net of their own, allocated past the wire nets and
unioned so a run of abutting components forms one node. It is physically right
and it matches what every player expects.

### A pin connected to nothing draws nothing
The corollary, and the more valuable half. The renderer used to draw every pin
stub regardless, so an unwired gate looked wired. Stubs are now drawn only where
the pin is actually on a net, which turns "why doesn't this work" into a visible
gap in the picture.

Two more legibility fixes from the same session, both aimed at the failures the
variant sweep turned up:

- **The placement ghost shows orientation.** Input stubs in cyan, output in
  amber, glyph rotated. Placing a gate backwards was previously invisible until
  you inspected the drawn glyph, and it was the commonest way to get stuck.
- **The probe reports.** Tapping a net names it, gives its value and its driver
  count, and outlines every cell that shares it — which is how a player answers
  "are these actually one wire" without guessing.

### OR dominates BUF, and that is a live balance problem
The sweep's headline finding. `OR(x, x)` is a buffer, so the gate does
everything the copy does at the same price — one component, one tick — and more
besides. Measured across every searchable level: Gater never scores worse than
Copier, and on the half adder it wins 7 to 8.

The half adder shows exactly why. Its sum needs `a ∨ b` while its carry still
needs `a` and `b` intact:

```
OR   n2 = OR(a,b)                    1 component
BUF  n4 = BUF(a) | BUF(b)            2 components
```

**BUF is priced per signal preserved; OR is priced per join.** They tie when a
join needs one operand to survive, and OR wins whenever a join needs both. It is
hard to construct a case where BUF wins.

So the two tools are not really a choice — BUF is a strictly worse OR that
happens to arrive first. Copy feels like it has two answers only because its
palette offers both and its shape happens to tie.

Options, none taken yet:

1. **Make OR two cells** (1×2 rather than 1×1). Same component cost, more area —
   BUF wins on area, OR wins on count, and the tension lands on the metric that
   is currently doing the least work.
2. **Price OR at two components.** Blunt, and it would make the early gates
   dearer than they should be.
3. **Accept it.** BUF is training wheels that OR supersedes, and the palette
   gating keeps it relevant for one chapter.

Option 1 is the recommendation: it is the only one that turns a redundancy into
a trade-off, and it costs a single number in the kind table.

## Playtest round one

Six changes, all from watching the game get played rather than from reading it.

### The sandbox wears its own palette
It never had one. `openSandbox()` did not clear `levelId`, so the free board
inherited whatever level was last open — most often `WIRE ERASE PROBE NOT`, a
sandbox with no way to drive a circuit and nothing to read one with. It now has
an explicit palette that includes switches, clocks and lamps, and every
blueprint the player has earned.

The same fix exposed a second bug underneath it. `rebuild()` makes fresh
components with `state: 0`, so every switch snapped back off the moment you
drew another wire — which is every gesture. Switch positions now live on the
world as `switches: Map<"x,y", number>` and are re-applied after each rebuild.
State that belongs to the *player* must not live on a structure the editor
rebuilds.

### Never shrink a cell below a thumb
`fitViewport` would shrink to 16px to make a whole level fit. Measured on the
18-wide boards that is a 21px cell, which is under half the 44px hit target and
exactly the complaint. The floor is now 28px and wide levels simply overflow;
`clampViewport()` keeps three cells on screen so a pan can never lose the board.
Fitting the level is worth less than being able to hit it.

### Pins are marked
"Top and bottom in, east out when facing east" is a perfectly reasonable reading
of an unlabelled gate, and the game never corrected it. Outputs now draw a
filled arrowhead pointing out, inputs an open notch, in neutral ink so signal
colour keeps meaning signal. Drawn only at 18px and up, where they are legible
rather than noise.

### Verification plays back
A verdict with a dark board tells you *that* you failed. VERIFY now runs the
timeline, then replays it: `applyStep` drives the inputs, the board animates,
and an amber playhead band tracks the current step on the scope. RUN walks the
whole timeline on its own — `HOLD_TICKS` settled ticks, then the next input
state — instead of sitting on step one forever. STEP advances one input state
for reading a circuit at your own pace.

### Briefs give the goal, not the build
Several briefs printed their own solutions — "a copy is two inverters back to
back", "that route costs five components and three ticks". Rewritten to state
the goal and the constraint and stop. Early puzzles having one answer is fine in
a teaching game; being told the answer is not.

### The controls row wraps
Adding STEP and CLEAR pushed VERIFY half off the right edge of a 390px screen.
The tool strip may scroll — it grows with the palette — but the controls may
not: a primary action you have to scroll to find is a bug. They wrap, and VERIFY
lands full-width on its own row. The sandbox renders neither STEP nor VERIFY at
all, having no timeline to walk or verify.

### The smoke test
`scripts/smoke.mjs` drives the built app in a real browser at 390px: it clicks
the menu, picks palette chips, drags wires on the canvas, and asserts against
the world the app actually built. Every one of the six bugs above was found by
playing, and none of them could have been caught by the unit tests, which prove
the simulator rather than the game. Twenty-one assertions, run against `dist`.

### The display is an output device, not a decoration
A level about showing a number should be graded on the number. `Level.display`
places a locked `Kind.Seg7` and `readOutput` answers to its segment pins by
name, so the device the player is looking at is the device the verifier reads.
The alternative — seven sinks parked beside the display — would have had people
wiring to the thing next to the answer.

Its pins moved to one edge at the same time. Four west and three east is how a
real package is built, and it turns a puzzle about which segments to light into
a puzzle about routing three wires around the back of a part. Seven pins down
the west edge of a 3x7 body means a driver's outputs meet them as seven straight
wires, and the body is still digit-shaped.

### A tile cannot share a wire with the board
Segment `f` is lit for digit 0 alone, so on a board it is `n0` — a wire, costing
nothing. Packaged as `digit4` it costs a buffer, because a blueprint's `netMap`
has no way to say "this output pin and that input pin are the same host net".
The tile bills nine where the hand-built matrix bills eight, and that gap is
left visible rather than papered over: packaging has a price here, and a player
who builds it themselves should get the better score.
