# Latches do not compose. The substrate has to change.

This is a blocking finding for chapter 4 and everything above it. It is not a
bug in a level or a blueprint — it is a property of the update model.

## What was tested

1. **Blueprint flattening with a cycle** — an SR latch whose two inverters read
   each other, and whose S pin and Q pin are the *same internal net*. This was
   broken and is now fixed: flattening let the last pin on a shared internal net
   overwrite the first, so a latch with an unwired q̄ silently lost its R input.
   Fixed in `blueprint.ts`, pinned by four tests. **Latches work as tiles.**

2. **A master-slave flip-flop from two D latches** — oscillates. Never settles.

3. **Why** — traced to the update model, below.

4. **Whether a power-on-safe D latch exists at all** — with inverters alone,
   exhaustively, at seven parts or fewer: **no**.

## The reason

Four facts that are individually fine and jointly fatal:

- **Nothing drives LOW.** Every driver pulls high or lets go, and a weak
  pull-down supplies the zeros. This is the substrate's founding decision and
  everything good about the game comes from it.
- **So power-on is all-zero** — and that is the most symmetric state there is.
  Every inverter sees a low input, so every inverter fires at once.
- **Resettable memory needs an inverting loop.** A non-inverting self-hold
  (`n = a | BUF(n)`) powers on cleanly at zero, but nothing can ever pull it
  back down, because nothing drives low. Only a cross-coupled pair can be
  reset — one side raises the other's input, which makes its inverter let go.
- **A cross-coupled pair is symmetric, and update is simultaneous.** From the
  all-zero state both inverters fire together, both nets go high together, both
  let go together, forever. Real hardware breaks this tie with mismatched
  delays. Simultaneous update preserves the symmetry exactly.

Standalone latches passed only because their timelines happened to open with an
input asserted, which broke the tie from outside. **A master-slave cannot do
that**: its two enables are complements, so one latch is always disabled at
t = 0, always in the symmetric state, always ringing.

That is why the 6-part D latch works alone and fails the moment it is used.

## Measured

| question | answer |
|---|---|
| SR latch as a tile, cycle and shared S/Q net | works — 2 components, 1 tick, after the flatten fix |
| D latch, timeline opens with EN **high** | 6p / 2t (BUF), exhaustive |
| D latch, timeline opens with EN **low** (must power on unaided) | **none at ≤7, inverters alone, exhaustive** |
| Master-slave from the 6-part latch | never settles |
| Any degenerate 1-tile answer to the flip-flop spec | none at ≤6 billed, exhaustive — the spec is honest |

## Options

**A. Ordered update within a tick.** Evaluate components in a deterministic
order instead of all at once, so a cross-coupled pair resolves the way a
unit-delay gate simulator resolves it. This is how most real gate-level
simulators behave. Latches then power on to a defined state with no extra
parts and no extra concepts.
*Cost:* every tick par in the game is re-measured; "depth" becomes slightly
less clean as a story, because order matters within a tick.

**B. An explicit power-on reset phase.** The harness holds a global CLEAR
asserted before step 0. Realistic — every real system has power-on reset — and
cheap to implement.
*Cost:* every memory element needs a clear path wired to it, which is parts the
player pays for and a concept chapter 4 has to teach immediately. The search
already caught one attempt at this where CLEAR collapsed into ENABLE and did
nothing.

**C. Seed power-on asymmetrically.** Give `reset()` a deterministic non-uniform
starting state.
*Cost:* arbitrary and unteachable. It would work and it would be a lie.

**D. Add a memory primitive.** A latch component, not built from inverters.
*Cost:* abandons the game's thesis at exactly the point the thesis gets
interesting.

## Recommendation

**A.** It is the only option that fixes the cause rather than working around
it, it costs the player nothing, and it makes the simulator behave like the
thing it is modelling. B is a real technique and worth teaching *later* — a
reset line is good design — but making it mandatory in the first memory level
is a tax on the wrong lesson.

Re-measuring tick pars is a `npm run balance` away, and every par in the game
is derived rather than typed, so nothing has to be edited by hand.

## Not blocked by this

- The flatten fix is independent and already landed.
- The copy corrections about the textbook XOR are independent and already
  landed.
- Macro/tile support in the search is independent and already landed. It costs
  a tile at its flattened primitive count, and it proved the flip-flop spec has
  no cheap degenerate answer — that check is what caught two broken specs.
