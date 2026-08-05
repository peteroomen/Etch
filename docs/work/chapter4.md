# Chapter 4 — memory

## The constraint that shapes the whole chapter

The simulator updates every component simultaneously, then commits. That means
**a symmetric feedback loop never settles.** Two inverters in a ring is a
bistable in silicon, where mismatched delays break the tie; here both flip
together, forever:

```
power-on   N=LO M=LO
tick 1     inv1 sees N low -> drives M    inv2 sees M low -> drives N
           N=HI M=HI
tick 2     inv1 sees N high -> lets go    inv2 sees M high -> lets go
           N=LO M=LO      ... and round again
```

Measured on the bench: a two-inverter Hold oscillates from a cold start, and
the SR latch oscillates if both S and R are released at once. The verifier
already reports this honestly — *"This oscillates — it never settles"* — which
turns the trap into a lesson rather than a mystery.

Two consequences for level design:

1. **Every sequential timeline must open with a step that forces a state.**
   Step 0 asserts R (or S), so the latch starts defined. This is not a
   workaround; it is what a real system does at power-on, and showing it on the
   scope is worth a paragraph of brief.
2. **Asymmetric solutions are cheaper than symmetric ones here.** A BUF reading
   its own output holds for one component and never oscillates, because it is
   not a ring — it is a single element agreeing with itself.

## The levels

### 13. Hold
*Feedback is memory.*

Q goes HIGH the first time A does, and stays HIGH after A drops. No reset.

The discovery: a component that reads the net it drives keeps its own output
alive. One BUF does it. Two inverters also do it, but only from a defined
start — which is the first time the game shows a circuit that depends on how it
was switched on.

- palette: wire, not, buf
- timeline: `a` pulses; `q` rises with the first pulse and never falls
- unlocks: nothing (the shape is the lesson, not the part)

### 14. Set and reset
*Two nets, each holding the other down.*

Q goes HIGH on S, LOW on R, and holds when both are low.

Cross-coupled inverters — but the interesting part is that in this substrate
**you never build the NOR.** The merge *is* the NOR's input stage: S and the
feedback share a net because joining is destructive. Q is read off the S net,
exactly as an open-collector latch behaves.

- palette: wire, cross, not
- timeline opens with R asserted, so the latch starts at 0
- measured on the bench: 2 components, 1 tick to switch
- unlocks: `srlatch`

### 15. Gated
*Memory with a door on it.*

Q follows D while EN is HIGH, and holds whatever it had when EN drops.

S = D ∧ EN, R = ¬D ∧ EN, into the latch you just built. The first level where
an unlocked blueprint is load-bearing rather than convenient.

- palette: wire, cross, not, and2, srlatch
- unlocks: `dlatch`

### 16. Edge
*Two doors that are never open at once.*

Q changes only on a rising edge of EN, not while it is high.

Master and slave latches on opposite phases of the enable. This is the level
that explains why a clocked machine works at all: a transparent latch in a
feedback loop races itself, and two of them out of phase do not.

- palette: wire, cross, not, dlatch
- unlocks: `dff`

### 17. Divide
*The first thing in the game that counts.*

Feed Q̄ back to D and the output toggles once per clock edge — half the input
frequency. Introduces the CLOCK component as a level input.

Needs `advance: { mode: 'ticks' }` rather than settle mode: a divider is never
supposed to reach a steady state, so "settle" is the wrong question to ask it.

- palette: wire, cross, not, dff
- unlocks: `div2`

### 18. Count to four *(proposed)*
*Two dividers, and a number.*

Two dividers in series give a 2-bit counter. Drive two lamps and watch it count
0,1,2,3. Sets up chapter 5 — registers, and then the seven-segment display that
is already in the kind table but has never been used.

## What has to change in the engine

- **The model is blind here.** `synth.ts` enumerates combinational netlists
  only, so none of chapter 4 can have its par checked the way chapters 1–3 did.
  Either the search grows a notion of state, or these levels get par from the
  reference and an explicit note that par is unverified.
- **`stepTimeline` already exists** and is the right shape for all of these; no
  level in the game uses it yet.
- **Blueprints with internal feedback are untested.** An `srlatch` blueprint has
  an input pin and an output pin on the *same* internal net. The flattening and
  aliasing should handle it — that is the same mechanism NOR's shared input pins
  use — but it needs a test before a level depends on it.
