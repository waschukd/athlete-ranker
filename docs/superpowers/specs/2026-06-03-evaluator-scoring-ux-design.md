# Evaluator scoring screen — heads-up enhancements

**Date:** 2026-06-03
**Ship:** PR (highest-frequency live surface; needs on-device tablet/Safari testing).
**Scope:** `src/app/evaluator/score/[scheduleId]/page.jsx` (+ possibly `src/lib/speechAdapter.js` for voice).

## Goal

Cut "heads-down" time so evaluators watch play, not the screen. Mostly tablet/MacBook
landscape. The screen already has jersey-grid selection, three view modes (Buttons /
Numpad / Grid — Grid is the "one category across players" cadence), voice, offline
sync, and a calibration banner. This is targeted enhancement, not a rebuild.

## Changes

### 1. Show POSITION everywhere (high value — IQ is judged by position)
Athletes carry a `position` field (and `external_id`, used as a helmet-sticker id).
- **Jersey tiles** (the selection grid): under the jersey number, show a small
  position label (e.g. "F"/"D"/"G" or the raw position). Keep the team-color dot.
- **Card/Numpad header**: always show position next to `#jersey` — currently it only
  appears when `!isAnon && external_id`. Position is NOT identifying, so show it even
  in anonymous mode (names stay hidden in anon; jersey + position shown).
- **Grid view**: add the position next to the name/jersey (or a small column).
- Anonymous mode unchanged for names; position + jersey always visible.

### 2. Tablet / landscape sizing (bigger, glanceable targets)
Use responsive Tailwind (`md:` / `lg:`) so phone stays as-is but tablet/laptop get
larger touch targets:
- Jersey tiles: bigger min size on `md+` (e.g. `minHeight` ~72–84px, larger number
  font) and a denser-but-bigger grid for landscape.
- Score buttons (Buttons mode): taller/larger on `md+` (`md:py-3 md:text-base`),
  comfortable for a quick look-and-tap.
- Keep the selected player's header + scores visible without long scrolling
  (the panel is already near the top — ensure it stays in view on tablet).

### 3. Safari/Apple voice — capability detection + lifecycle hardening (best-effort)
The Web Speech API is unreliable in Safari (auto-stops, no true continuous, needs a
user gesture). Without claiming a full fix:
- **Detect Safari/iOS** (`/^((?!chrome|android).)*safari/i` on UA, or
  `webkitSpeechRecognition` quirks) and show a small one-time hint near the mic
  toggle: e.g. "Voice on Safari can be flaky — tap the mic again if it stops, or use
  fast tap scoring." Sets honest expectations.
- **Restart-on-end**: ensure the web recognizer re-arms in `onend` while voice is on
  (emulates continuous), which is the main Safari pain. The implementer must READ the
  existing voice `useEffect` and only add/repair the restart loop conservatively
  (Android already does similar) — do not rewrite the working Chrome/Capacitor paths.
- Make sure when voice is unavailable/denied, the fast tap flow (now bigger from #2)
  is the obvious fallback.
- **Honesty:** the PR must state Safari voice reliability is unverified here and needs
  a real tablet test — this is why the whole change is a PR.

## Testing

- No pure-logic added → primarily `npm run build` + full suite green.
- If a small pure helper is extracted (e.g. `isSafari(ua)` or a position-label
  formatter), unit-test it.
- Manual (for the human, in the PR checklist): on an iPad in Safari, confirm jersey
  tiles show position, targets are comfortable, and voice re-arms / the hint shows.

## Risks

- Voice lifecycle edits are the riskiest part — kept conservative, additive, and
  clearly flagged for device testing. Position + sizing are low-risk, high-value and
  can stand alone if voice needs more work.
