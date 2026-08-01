# Quiz polish: mistake diff, hints, gamified top bar, confetti background

## 1. Mistake highlighting (typed questions)

When a typed answer is wrong, the feedback card shows a line „Tvoja odpoveď:" with
the user's input rendered letter-by-letter:

- correct letters — normal color
- wrong/extra letters — red (`--danger`)
- missing letters — red `·` placeholder at the position where a letter was skipped

Implementation: `diffAnswer(typed, expected)` in `lib/text.ts` — Levenshtein
alignment with backtrace over folded characters (diacritics-insensitive, so
`dovera` vs `dôvera` produces no red). When the question has accepted synonyms,
diff against the accepted answer closest by edit distance
(`closestAnswer(typed, [answer, ...accepted])`). No diff line when the input was
empty („Neviem").

## 2. Hints (all typed question types)

„Nápoveda" button under the input. Hint 1 shows the word shape — letter count and
blanks (`6 písmen: _ _ _ _ _ _`, spaces in multi-word answers stay visible).
Each further hint reveals the next letter, capped at all-but-one letter.
Hint count resets per question.

- `hintMask(answer, hints)` and `maxHints(answer)` in `lib/questions.ts`
- Scoring: any hint used → question earns half points, rounded up
  (`applyHintPenalty(points, hintsUsed)` in `lib/scoring.ts`). Combo unaffected.

## 3. Gamified top bar (round page)

Chip row replacing the plain text header:

- left: `3/10` in a quiet surface pill
- center: combo chip from ×2 — warm gold→orange gradient pill, inline SVG flame
  (no emoji), bold white `×N`; springy pop-in, bounce on increment, disappears
  when the combo breaks
- right: score chip — gold pill with the 3D bottom edge, CSS coin dot, serif
  number; pops on gain and a floating `+N` rises and fades

Below the chips: full-width rounded progress track; fill is accent blue with the
3D bottom edge, animating width per answer; turns gold while a combo (×2+) runs.

## 4. Confetti background (app-wide)

Scattered soft dots near viewport edges — accent blue, gold, teal, pink at low
opacity. Pure CSS: layered radial-gradients on a fixed `body::before`,
`pointer-events: none`, `z-index: -1`. Dimmer in dark theme. No images, no
layout shift.

## Testing

Unit: diffAnswer (substitution, insertion, deletion, diacritic-only, closest
accepted), hintMask/maxHints, applyHintPenalty. UI verified in the browser at
mobile + desktop widths, light + dark.
