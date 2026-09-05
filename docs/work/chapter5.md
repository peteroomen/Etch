# Chapter 5 — width, counting, and a digit

Seven levels, taking the machine from "one bit that remembers" to a board that
shows a number. Every circuit here was prototyped and simulated before a level
was written, which is why none of them needed a redesign — the layouts did.

## The levels

| # | level | teaches | par | unlocks |
|---|---|---|---|---|
| 1 | Two of them | a register is one flip-flop per bit, on one clock | 26c 5t 52a | `reg2` |
| 2 | Only when told | a register that ignores the clock unless addressed | 19c 4t 73a | `regwe` |
| 3 | Count to three | chain two dividers and you are counting | 28c 6t 77a | `count2` |
| 4 | One of four | a two-bit number, turned into four lines | 12c 2t 90a | `dec24` |
| 5 | Naught and one | seven lamps in the shape of a digit | 3c 1t 29a | — |
| 6 | Every digit | a diode matrix | 8c 1t 130a | `digit4` |
| 7 | Show the count | all of it, counting on a display | 49c 8t 62a | — |

Pars are measured by running the references, never typed. `npx vite-node
scripts/refs.ts 5` prints all seven with their boards.

## What the substrate gave us for free

**A one-hot line makes a display cheap.** With exactly one of four lines high,
a segment lit for three digits out of four is a single inverter reading the
fourth. Segments `a` and `d` are the same signal, so they share a net rather
than an inverter each. Segment `f` is lit for digit 0 alone, so it is not a
component at all — it is a wire. The whole matrix is eight components.

**A constant HIGH costs two.** Segment `b` is lit for all four digits. The
obvious build is four buffered copies merged; the cheap one is `¬n1` merged
with `n1`, which is true whatever `n1` does. Half the price, and it falls
straight out of the wired-OR rule.

**The write enable is a merge, not a gate.** `(d ∧ we) ∨ (q ∧ ¬we)` is two NOR
arms at three components each, and the OR joining them is free because both
arms are fresh driven nets. Nineteen components including the flip-flop.

**The counter reuses its own inverter.** `NOT(q0)` is the low flip-flop's D,
which is what makes it toggle, and it is the high flip-flop's clock. Reading a
net costs nothing, so the second job is free.

## What it cost the engine

**The display had to become an output device.** A level about showing a number
should be graded on the number. So `Level.display` places a locked `Kind.Seg7`
and `readOutput` answers to its segment pins by name — the device the player is
looking at is the device the verifier reads. `outputNames` returns sinks first,
then segments.

**The display's pins moved to one edge.** They were four west and three east,
which is how a real package is, and which turns a puzzle about lighting a digit
into a puzzle about routing three wires around the back of a part. Now seven
pins run down the west edge of a 3x7 body, in order, so a driver's outputs meet
them as seven straight wires.

**A blueprint pin cannot alias one of its own inputs.** Segment `f` is `n0`, and
on a board that is a wire costing nothing. As a tile it costs a buffer, because
`netMap` has no way to say "this output pin and that input pin are the same host
net". So `digit4` bills nine where a hand-built matrix bills eight. That is a
real difference and the tile is honest about it.

## Where the layouts fought back

Every failure in this chapter was a routing failure, not a logic one, and the
same three mistakes kept recurring:

- **A run that terminates on a rail's end turns it into a junction.** The `f`
  line crossed all four rails on its way out and shorted them into one net,
  because the rails stopped on that row. `n0` now runs one row deeper than the
  rest so its last tap passes under them.
- **A wire cannot cross a corner.** Crossing works where both strokes pass
  straight through; a stroke over a turn makes a junction. Component rows have
  to avoid the rows where rails turn.
- **A signal has to actually reach where the next stroke starts.** The counter's
  `NOT(q0)` was drawn going up to one flip-flop and then, separately, along the
  bottom to the other — with nothing joining the two. It verified as a
  half-working counter rather than as a break.

Adjacent parallel wires, on the other hand, do *not* join: a cell connects only
along the directions its mask carries. That is worth knowing before spending an
hour avoiding it.

## The exemption, again

Two levels claim an output at step zero from a state nothing put them in. A
counter has no load input, so it starts from wherever the tick rule's tie-break
puts it. That is only fair because a tile's insides are emitted in the same
order however it is placed, and `chapter5.test.ts` builds the counter at three
board offsets and requires an identical trace. Delete that test and the
exemption becomes a lie — same bargain chapter 4 struck for Divide.

## Clues

`npm run clues` covers all 25 levels. Five of chapter 5's seven fall back to
reading a netlist off the reference, because a 26-to-49 component circuit is far
beyond what the search enumerates. That is the fallback working as designed: the
clue stops being "the smallest shape" and becomes "a shape that works".

## Left for later

`Kind.Nixie` is still unplaced. Ten one-hot cathodes is a BCD decoder's worth,
which wants a 4-to-10 decoder and a counter that counts to nine — a chapter
about decimal, not this one.
