# Evaluator Voice Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the spoken-decimal ordering bug (testable extraction), add out-of-range voice feedback, and add navigation-end voice feedback on the evaluator scoring screen.

**Architecture:** Extract spoken-number normalization into a pure tested function `normalizeSpokenNumbers` in `voiceMatch.js` (word→digit BEFORE fractions), and call it from `parseVoice`. Two small in-component feedback additions for out-of-range scores and nav dead-ends.

**Tech Stack:** Next.js client component, Web Speech parsing, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-evaluator-voice-fixes-design.md`

---

## Task 1: `normalizeSpokenNumbers` in voiceMatch.js (TDD)

**Files:**
- Modify: `src/lib/voiceMatch.js`
- Test: `tests/unit/voiceMatch.test.js`

- [ ] **Step 1: Write failing tests.** Append to `tests/unit/voiceMatch.test.js`. First add `normalizeSpokenNumbers` to the existing import block at the top so it reads:

```javascript
import {
  findBestCategoryMatch,
  extractCandidates,
  buildAliasLookup,
  normalizeForMatch,
  normalizeSpokenNumbers,
} from "@/lib/voiceMatch";
```

Then append this describe block at the end of the file:

```javascript
describe("normalizeSpokenNumbers", () => {
  it("converts spoken digit-word + 'point five' to a decimal", () => {
    expect(normalizeSpokenNumbers("seven point five")).toBe("7.5");
  });
  it("keeps surrounding words and converts the fraction", () => {
    expect(normalizeSpokenNumbers("skating seven point five")).toBe("skating 7.5");
  });
  it("handles 'and a half' on a spoken number", () => {
    expect(normalizeSpokenNumbers("seven and a half")).toBe("7.5");
  });
  it("converts compound numbers", () => {
    expect(normalizeSpokenNumbers("twenty one")).toBe("21");
  });
  it("converts a word number mid-phrase", () => {
    expect(normalizeSpokenNumbers("white fourteen")).toBe("white 14");
  });
  it("passes already-numeric decimals through unchanged", () => {
    expect(normalizeSpokenNumbers("skating 7.5")).toBe("skating 7.5");
  });
  it("leaves plain integer scores intact", () => {
    expect(normalizeSpokenNumbers("skating 8 puck skills 7")).toBe("skating 8 puck skills 7");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run tests/unit/voiceMatch.test.js -t "normalizeSpokenNumbers"`
Expected: FAIL — `normalizeSpokenNumbers is not a function` / undefined import.

- [ ] **Step 3: Implement the function.** Append to `src/lib/voiceMatch.js`:

```javascript
// ── Normalize spoken numbers in an utterance ────────────────────────────────
// Word/compound numbers are converted to digits FIRST, then fractions, so that
// a spoken "seven point five" becomes "7.5" (not stranded as "7 point five").
export function normalizeSpokenNumbers(text) {
  const wordNums = {
    'zero':'0','oh':'0',
    'one':'1','won':'1',
    'two':'2','to':'2','too':'2','tu':'2',
    'three':'3','tree':'3',
    'four':'4','for':'4','fore':'4',
    'five':'5','fiver':'5',
    'six':'6','sex':'6','sicks':'6','seeks':'6','sticks':'6','dix':'6','sick':'6','sits':'6',
    'seven':'7','sven':'7',
    'eight':'8','ate':'8','ait':'8',
    'nine':'9','nein':'9','mine':'9',
    'ten':'10',
    'eleven':'11','twelve':'12','thirteen':'13','fourteen':'14',
    'fifteen':'15','sixteen':'16','seventeen':'17','eighteen':'18',
    'nineteen':'19','twenty':'20',
  };
  const compoundNums = {
    'twenty one':'21','twenty two':'22','twenty three':'23','twenty four':'24',
    'twenty five':'25','twenty six':'26','twenty seven':'27','twenty eight':'28',
    'twenty nine':'29','thirty':'30','thirty one':'31','thirty two':'32',
    'thirty three':'33','thirty four':'34','thirty five':'35',
  };

  let s = text.trim().toLowerCase();

  // Compound numbers first (before single-word replacement).
  for (const [words, num] of Object.entries(compoundNums)) {
    s = s.replace(new RegExp('\\b' + words + '\\b', 'gi'), num);
  }
  // Single word numbers (longest first so multi-word keys aren't pre-empted).
  const wordPattern = Object.keys(wordNums).sort((a, b) => b.length - a.length).join('|');
  s = s.replace(new RegExp('\\b(' + wordPattern + ')\\b', 'gi'), m => wordNums[m.toLowerCase()] || m);

  // Fractions AFTER digits exist, so spoken digit-words combine correctly.
  s = s.replace(/(\d+)\s+and\s+a\s+half/gi, '$1.5');
  s = s.replace(/(\d+)\s+point\s+five/gi, '$1.5');
  s = s.replace(/(\d+)\s+point\s+5/gi, '$1.5');
  s = s.replace(/(\d+)\s+point\s+(\d)/gi, '$1.$2');

  return s;
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run tests/unit/voiceMatch.test.js -t "normalizeSpokenNumbers"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/voiceMatch.js tests/unit/voiceMatch.test.js
git commit -m "feat(voice): normalizeSpokenNumbers — convert words to digits before fractions"
```

---

## Task 2: Use `normalizeSpokenNumbers` in parseVoice

**Files:**
- Modify: `src/app/evaluator/score/[scheduleId]/page.jsx`

- [ ] **Step 1: Update the import.** At the top, the existing import is:

```javascript
import { findBestCategoryMatch, extractCandidates, buildAliasLookup, normalizeForMatch } from "@/lib/voiceMatch";
```

Change to:

```javascript
import { findBestCategoryMatch, extractCandidates, buildAliasLookup, normalizeForMatch, normalizeSpokenNumbers } from "@/lib/voiceMatch";
```

- [ ] **Step 2: Replace the inline number block.** In `parseVoice`, find the block that starts at `const wordNums = {` and ends just before `const corrected = normalized.replace(/\bfuck\s+skills?/gi, ...)`. That whole block (the `wordNums` map, `compoundNums` map, `let normalized = text.trim().toLowerCase();`, the four fraction `.replace` lines, the compound loop, and the single-word `wordPattern` replacement) must be replaced with this single line:

```javascript
    let normalized = normalizeSpokenNumbers(text);
```

Leave everything after it intact — the next lines remain:

```javascript
    const corrected = normalized.replace(/\bfuck\s+skills?/gi, "puck skills").replace(/\bfuck(?=\s)/gi, "puck");
    const t = corrected.trim().toLowerCase();
    setVoiceStatus(`"${text}"${normalized !== text.trim().toLowerCase() ? ' → ' + normalized : ''}`);
```

- [ ] **Step 3: Build + full suite.**

Run: `npm run build` — expect compile success for the evaluator route.
Run: `npm run test` — expect the whole suite green (no count change vs Task 1's result).

- [ ] **Step 4: Commit.**

```bash
git add "src/app/evaluator/score/[scheduleId]/page.jsx"
git commit -m "refactor(voice): parseVoice uses shared normalizeSpokenNumbers (fixes spoken decimals)"
```

---

## Task 3: Out-of-range + navigation-end feedback

**Files:**
- Modify: `src/app/evaluator/score/[scheduleId]/page.jsx`

- [ ] **Step 1: Add the `beepEdge` helper.** Next to the other beep helpers (after `function beepError() { playTone(220, 0.15, "square"); }`), add:

```javascript
function beepEdge() { playTone(440, 0.1); }
```

- [ ] **Step 2: Navigation-end feedback.** Replace the `navigate` callback:

```javascript
  const navigate = useCallback((dir) => {
    const current = selectedRef.current;
    const list = filtered;
    if (!current) { if (list.length) setSelected(list[0]); return; }
    const idx = list.findIndex(a => a.id === current.id);
    const next = list[idx + dir];
    if (next) setSelected(next);
  }, [filtered]);
```

with:

```javascript
  const navigate = useCallback((dir) => {
    const current = selectedRef.current;
    const list = filtered;
    if (!current) { if (list.length) setSelected(list[0]); return; }
    const idx = list.findIndex(a => a.id === current.id);
    const next = list[idx + dir];
    if (next) { setSelected(next); }
    else { setVoiceStatus(dir > 0 ? "End of list" : "Start of list"); beepEdge(); }
  }, [filtered]);
```

- [ ] **Step 3: Out-of-range feedback.** In `parseVoice`, the score-matching section currently is structured as: an exact-match loop over `cats`, then `if (scored > 0) {...return;}`, then a fuzzy fallback loop, then `if (scored > 0) {...return;}`.

  (a) Immediately before the exact-match loop's `let scored = 0;` line, add a tracker:

```javascript
      let rangeError = null;
```

  (b) In the exact-match inner loop, the current matched branch is:

```javascript
          if (m) {
            const val = parseFloat(m[1]);
            const inc = parseFloat(incrementRef.current) || 1;
            const max = parseFloat(scaleRef.current) || 10;
            if (val >= inc && val <= max) {
              if (sel) { updateScore(sel.id, cat.id, val, { allowToggle: false }); scored++; break; }
              else { setVoiceStatus("Select a player first"); beepError(); break; }
            }
          }
```

  Replace it with (adds an `else` that records the out-of-range value):

```javascript
          if (m) {
            const val = parseFloat(m[1]);
            const inc = parseFloat(incrementRef.current) || 1;
            const max = parseFloat(scaleRef.current) || 10;
            if (val >= inc && val <= max) {
              if (sel) { updateScore(sel.id, cat.id, val, { allowToggle: false }); scored++; break; }
              else { setVoiceStatus("Select a player first"); beepError(); break; }
            } else if (!rangeError) {
              rangeError = { cat: cat.name, val, inc, max };
            }
          }
```

  (c) In the fuzzy fallback loop, the current matched branch is:

```javascript
          if (value >= inc && value <= max) {
            const result = findBestCategoryMatch(phrase, cats, aliasLookupRef.current);
            if (result) {
              const cat = cats.find(c => normalizeForMatch(c.name) === normalizeForMatch(result.match));
              if (cat) {
                updateScore(sel.id, cat.id, value, { allowToggle: false });
                scored++;
                fuzzyMatches.push({ cat: cat.name, value, heard: phrase, method: result.method });
              }
            }
          }
```

  Add an `else` that records an out-of-range fuzzy attempt (only when the phrase actually matched a category):

```javascript
          if (value >= inc && value <= max) {
            const result = findBestCategoryMatch(phrase, cats, aliasLookupRef.current);
            if (result) {
              const cat = cats.find(c => normalizeForMatch(c.name) === normalizeForMatch(result.match));
              if (cat) {
                updateScore(sel.id, cat.id, value, { allowToggle: false });
                scored++;
                fuzzyMatches.push({ cat: cat.name, value, heard: phrase, method: result.method });
              }
            }
          } else if (!rangeError) {
            const result = findBestCategoryMatch(phrase, cats, aliasLookupRef.current);
            if (result) rangeError = { cat: result.match, val: value, inc, max };
          }
```

  (d) Surface it. Immediately AFTER the fuzzy fallback's closing `if (scored > 0) { ... return; }` block and before the `// ── Navigation ──` comment, add:

```javascript
      if (scored === 0 && rangeError) {
        setVoiceStatus(`${rangeError.cat}: ${rangeError.val} out of range (${rangeError.inc}–${rangeError.max})`);
        beepError();
        return;
      }
```

- [ ] **Step 4: Build + full suite.**

Run: `npm run build` — expect success.
Run: `npm run test` — expect green.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/evaluator/score/[scheduleId]/page.jsx"
git commit -m "feat(voice): out-of-range score feedback + navigation-end feedback"
```

---

## Task 4: Final verification

- [ ] **Step 1:** Run `npm run test` — full suite green (prior 88 + 7 new = 95).
- [ ] **Step 2:** Run `npm run build` — clean.
- [ ] **Step 3:** Report commit SHAs; controller handles merge/push.

---

## Self-Review

**Spec coverage:** Fix 1 (extract+reorder, tested) → Tasks 1–2. Fix 2 (out-of-range) → Task 3 Steps 1,3. Fix 3 (nav-end) → Task 3 Steps 1–2. De-scoped items absent. ✓

**Placeholder scan:** No TBD/TODO; full code in every step. ✓

**Type/name consistency:** `normalizeSpokenNumbers` exported in Task 1, imported in Task 2, tested in Task 1. `beepEdge`/`rangeError` defined before use within Task 3. `incrementRef`/`scaleRef`/`aliasLookupRef`/`findBestCategoryMatch`/`normalizeForMatch` already exist in the file. ✓
