# Chapter 6 — decimal, and two ways to count to ten

Six levels. The chapter's spine is that counting to ten has two honest answers
and neither wins outright, so it builds both and puts the numbers side by side.

## The levels

| # | level | teaches | par | unlocks |
|---|---|---|---|---|
| 1 | Clear | a memory you can wipe, whatever else it is doing | 8c 2t 54a | `dlatchc` |
| 2 | Clear on the edge | a clear that does not wait for the clock | 17c 5t 77a | `dffc` |
| 3 | Decade | a counter that watches itself and starts again | 75c 12t 219a | `count10` |
| 4 | Pass it on | a line of flip-flops sharing one clock | 68c 3t 205a | `shift4` |
| 5 | Round and round | one bit in a circle is a counter with no decoder | 68c 3t 87a | — |
| 6 | Ten in a ring | ten states, ten wires, a tube that needs no decoder | 170c 3t 289a | — |

`npx vite-node scripts/refs.ts 6` prints all six with their boards.

## The trade the chapter is about

|  | binary decade | ten-stage ring |
|---|---|---|
| components | 75 | 170 |
| ticks | 12 | 3 |
| wires carrying the number | 4 | 10 |
| cost to drive a ten-cathode tube | 46 (a 4-to-10 decoder) | 0 |

So the ring is more than twice the parts — and even with the decoder added the
binary route is still cheaper end to end, 121 against 170 — but the ring is four
times faster and its output IS the display driver. That is a genuine trade rather than a right
answer, which is what chapter 5's roadmap note asked for — the balance sweep
had been complaining that levels have one dominant solution.

The tick difference is the honest headline, and it is structural: the decade
counter RIPPLES, so its depth grows with its stages, while every stage of the
ring shares one clock and it stays at three however long it gets. The tests
measure both halves rather than trusting the briefs.

## Getting a clear at all

The plain latch tile is sealed — its cross-coupled pair has no pins on it — so
a clear cannot be added from outside. But the SR latch's R pin *is* exposed, and
R already does the job: it pulls q-bar up, which makes the inverter holding q
let go.

The only care needed is that the SET term lets go at the same moment, or the two
ends fight over one node and the latch is told two things at once. So CLEAR is
merged into both the set term and the reset, and merging is free. Two components
over the plain latch; seventeen for the edge-triggered version, which is two
clearable latches and the clock inverter.

Everything after that is downstream of having it. The decade counter needs it
four times, the shift register needs it four times, and the ring needs it to
start from a state it chose rather than one the tick rule chose.

## Stopping at nine costs three components

Ten is 1010, and it is the only count a four-bit counter can REACH with q3 and
q1 both set — eleven would too, but the clear fires before eleven can happen. So
the detector is two inverters and a merge, and its output goes straight to every
stage's clear line.

The external CLR pin shares that same net. An outside clear and an at-ten clear
are the same wire, which is a wired OR, which is free.

## What the tests caught

Four real defects, all in the specs rather than the circuits:

- **Clear on the edge never asked D to load a ZERO.** With D pinned high the
  whole timeline still passed, so a flip-flop that ignored D entirely — set on a
  rising edge, clear on CLR — would have scored par. Fixed with a rise that
  loads a zero over a one, which no clear can fake.
- **Both ring levels passed with CLR pinned low**, because the ring happened to
  power on empty. That is the tick rule's tie-break, not the circuit, and
  chapter 4 established that no level may depend on it. Both now wipe themselves
  mid-turn and require the tube to go dark, then restart.
- **Decade claimed 0000 at step zero from a state nothing put it in.** Rather
  than take chapter 4's exemption, the level gained a real CLR input — which
  costs nothing, is what a 7490 actually has, and means chapter 6 needs no
  exemption at all.

The "every input changes the answer" check from chapter 5 found the first three
on its own. It is worth keeping in every chapter.

## Where the layouts fought back

Two recurring shapes, both new since chapter 5:

- **A flip-flop's clock and clear pins are two rows apart on the same edge**, so
  one column cannot serve both — a riser to the clock passes straight through the
  clear wire and shorts them. Every level with a clearable flip-flop routes the
  two in separate columns. This cost three separate debugging rounds before it
  was named.
- **An inverter reading a crossover gets the horizontal net.** The decade
  counter's ten-detector was reading q0's output line instead of q3, because the
  cell it tapped happened to be a cross. Both detector taps now read their bit
  where its line runs straight.

## The tube

`Kind.Nixie` got the same treatment `Kind.Seg7` got in chapter 5: ten pins, one
per row, down the west edge of a 3x10 body, so a one-hot driver's outputs meet
them as ten straight wires. It renders as ten stacked numerals with the live one
glowing, rather than as segments, because that is what a nixie is — ten separate
wire digits behind each other in one envelope.

If more than one cathode is high, more than one numeral lights, overlapping.
That is what the real tube does, and it is a better bug report than any error
message: a driver that is not one-hot LOOKS wrong.

## Left for later

Two digits, and carry between decades. That is the last thing before arithmetic
on displayed numbers, and it wants the 4-to-10 decoder this chapter routed
around — forty-six components, measured, and the reason the ring exists.
