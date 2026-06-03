# Evaluator voice fixes

**Date:** 2026-06-02
**Status:** Approved design, pending implementation
**Scope:** `src/lib/voiceMatch.js`, `src/app/evaluator/score/[scheduleId]/page.jsx`, `tests/unit/voiceMatch.test.js`

## Problem

Three real friction points on the live voice scoring screen (the highest-frequency
action in the app). A code audit also flagged decimals and multi-word categories,
but inspection showed decimals are *mostly* handled and multi-word matching
*already works* — so those are de-scoped except for one genuine decimal bug.

1. **Decimal ordering bug.** In `parseVoice`, fraction normalization
   (`page.jsx:548-551`) runs *before* word→digit conversion (`:553-558`). So a
   spoken "seven point five" is still the word "seven" when the `(\d+)\s+point...`
   regex runs → no match → it becomes "7 point five" too late to convert. Spoken
   digit-words combined with fractions never become `X.5`.
2. **Out-of-range silently dropped.** When a category keyword matches a number
   but the value fails `val >= inc && val <= max` (`:678`, `:694`), nothing
   happens — no beep, no message. The evaluator can't tell the score was rejected.
3. **Navigation dead-ends silently.** `navigate` (`:502-509`) is a no-op at the
   first/last player. Saying "next" at the end gives no feedback.

Non-goals: multi-word category matching (already works via per-word + fuzzy),
expanding the alias map, lowering the fuzzy threshold, wrap-around navigation.

## Design

### Fix 1 — extract & reorder spoken-number normalization (testable)

Add a pure, exported function to `src/lib/voiceMatch.js`:

```
normalizeSpokenNumbers(text) -> string
```

It performs, in this corrected order:
1. Lowercase/trim.
2. Compound numbers ("twenty one" → "21", … through "thirty five").
3. Single-word numbers ("seven" → "7", "fourteen" → "14", incl. the existing
   homophones: won/to/too/for/fore/ate/nine variants, etc.).
4. **Then** fractions: `(\d+) and a half → $1.5`, `(\d+) point five → $1.5`,
   `(\d+) point 5 → $1.5`, `(\d+) point (\d) → $1.$2`.

Because word→digit runs first, "seven point five" → "7 point 5"/"7 point five"
→ "7.5", and "seven and a half" → "7 and a half" → "7.5". Already-numeric input
like "skating 7.5" passes through unchanged.

`parseVoice` in `page.jsx` replaces its inline `wordNums`/`compoundNums`/fraction
block with a call to `normalizeSpokenNumbers(text)`. The existing
`fuck`→`puck` correction and the `setVoiceStatus("\"text\" → normalized")`
display are preserved (status shows the function's output).

### Fix 2 — out-of-range feedback (in-component)

In the exact-match score loop and the fuzzy fallback loop, when a category is
recognized with a number but the value is out of `[inc, max]`, capture it
(`rangeError = { cat, val, inc, max }`, first occurrence wins). After both loops,
if `scored === 0` and `rangeError` is set:
`setVoiceStatus(`${cat}: ${val} out of range (${inc}–${max})`)` and `beepError()`.
The success path (`scored > 0`) is unchanged.

### Fix 3 — navigation-end feedback (in-component)

Add a small `beepEdge()` tone helper (distinct from the error buzz — a single
soft tone, e.g. `playTone(440, 0.1)`). In `navigate(dir)`, when the computed next
player does not exist (and a player is currently selected), do not move; instead
`setVoiceStatus(dir > 0 ? "End of list" : "Start of list")` and `beepEdge()`.
The `current == null` branch (select first) is unchanged. Tap nav buttons are
already `disabled` at the ends, so this path is voice-only.

## Testing

- **Fix 1:** unit tests appended to `tests/unit/voiceMatch.test.js` for
  `normalizeSpokenNumbers`:
  - `"seven point five"` → `"7.5"`
  - `"skating seven point five"` → `"skating 7.5"`
  - `"seven and a half"` → `"7.5"`
  - `"twenty one"` → `"21"`
  - `"white fourteen"` → `"white 14"`
  - `"skating 7.5"` → `"skating 7.5"` (passthrough)
  - `"skating 8 puck skills 7"` → unchanged digits
- **Fixes 2 & 3:** in-component branch additions. No component-test harness exists
  in this repo, so these are verified by `npm run build` + the full unit suite
  staying green — explicitly *not* unit-tested. Stated plainly, not faked.

## Files

- `src/lib/voiceMatch.js` — add `normalizeSpokenNumbers`.
- `src/app/evaluator/score/[scheduleId]/page.jsx` — use it; out-of-range +
  nav-end feedback; `beepEdge`.
- `tests/unit/voiceMatch.test.js` — `normalizeSpokenNumbers` tests.

## Risks

- Reordering changes behavior only for spoken digit-words + fractions (the bug).
  Pure-digit input is untouched (verified by passthrough test).
- `beepEdge` adds audio on every voice nav dead-end; kept short/soft to avoid
  annoyance, and only fires when nav can't move.
