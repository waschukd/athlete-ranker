# Team Insights Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** A pure, tested engine that finds clean-break cut lines, flags bubble players, and recommends a lean (game play prioritized), surfaced in a new Insights tab.

**Spec:** `docs/superpowers/specs/2026-06-03-team-insights-design.md`

---

## Task 1: `teamInsights` engine (TDD — the heart)

**Files:**
- Create: `src/lib/teamInsights.js`
- Create: `tests/unit/teamInsights.test.js`

- [ ] **Step 1: Write failing tests.** Create `tests/unit/teamInsights.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { buildSignals, detectBreaks, computeLean, analyzeTeams } from "@/lib/teamInsights";

const sessions = [
  { session_number: 1, session_type: "testing" },
  { session_number: 2, session_type: "scrimmage" },
  { session_number: 3, session_type: "scrimmage" },
];

function athlete(id, rank, composite, testing, game, agreement, rankHist) {
  return {
    id, first_name: "P" + id, last_name: "L" + id, rank,
    weighted_total: composite, agreement_pct: agreement,
    rank_history: rankHist || [],
    session_scores: {
      1: { normalized_score: testing, source: "testing" },
      2: { normalized_score: game, source: "skills" },
      3: { normalized_score: game, source: "skills" },
    },
  };
}

describe("buildSignals", () => {
  it("splits testing vs game and computes divergence", () => {
    const s = buildSignals(athlete("a", 1, 80, 90, 60, 75, [2, 1]), sessions);
    expect(s.testingScore).toBe(90);
    expect(s.gameScore).toBe(60);
    expect(s.divergence).toBe(-30); // plays worse than tests
    expect(s.trend).toBeGreaterThan(0); // ranks improved 2 → 1
  });
});

describe("detectBreaks", () => {
  const ranked = [
    { composite: 90 }, { composite: 89 }, { composite: 88 },
    { composite: 70 }, { composite: 69 }, { composite: 68 },
  ];
  it("finds a clean break at the obvious gap near the cut", () => {
    const breaks = detectBreaks(ranked, [3, 3], {});
    expect(breaks).toHaveLength(1);
    expect(breaks[0].suggestedCut).toBe(3);
    expect(breaks[0].isClean).toBe(true);
    expect(breaks[0].gap).toBeCloseTo(18, 1);
  });
  it("reports no clean break on a flat field", () => {
    const flat = [90, 89, 88, 87, 86, 85].map(c => ({ composite: c }));
    const breaks = detectBreaks(flat, [3, 3], {});
    expect(breaks[0].isClean).toBe(false);
  });
  it("returns one entry per interior cut", () => {
    const breaks = detectBreaks(ranked, [2, 2, 2], {});
    expect(breaks).toHaveLength(2);
    expect(breaks.map(b => b.intendedCut)).toEqual([2, 4]);
  });
});

describe("computeLean (game prioritized)", () => {
  it("leans DOWN when a player tests well but plays poorly", () => {
    const r = computeLean({ divergence: -30, trend: 0, agreement: 80 }, {});
    expect(r.lean).toBe("down");
    expect(r.reasons.join(" ").toLowerCase()).toContain("game play prioritized");
  });
  it("leans UP when a player plays better than they test", () => {
    const r = computeLean({ divergence: 30, trend: 0, agreement: 80 }, {});
    expect(r.lean).toBe("up");
  });
  it("is a toss-up with a balanced profile and high agreement", () => {
    const r = computeLean({ divergence: 0, trend: 0, agreement: 85 }, {});
    expect(r.lean).toBe("tossup");
    expect(r.confidence).toBe("high");
  });
  it("flags low evaluator agreement for human review without flipping the lean", () => {
    const r = computeLean({ divergence: 0, trend: 0, agreement: 50 }, {});
    expect(r.confidence).toBe("low");
    expect(r.needsReview).toBe(true);
  });
});

describe("analyzeTeams", () => {
  it("returns breaks and a bubble list with leans", () => {
    const ranked = [
      athlete("a", 1, 90, 92, 88, 90, [1, 1]),
      athlete("b", 2, 89, 70, 95, 85, [3, 1]),
      athlete("c", 3, 88, 88, 88, 80, [2, 2]),
      athlete("d", 4, 70, 90, 60, 55, [1, 5]),
      athlete("e", 5, 69, 68, 70, 80, [5, 4]),
      athlete("f", 6, 68, 66, 69, 80, [6, 6]),
    ];
    const out = analyzeTeams(ranked, sessions, [3, 3], {});
    expect(out.breaks).toHaveLength(1);
    expect(out.bubbles.length).toBeGreaterThan(0);
    expect(out.bubbles[0]).toHaveProperty("lean");
    expect(out.bubbles[0]).toHaveProperty("reasons");
  });
});
```

- [ ] **Step 2: Run, verify failure.** `npx vitest run tests/unit/teamInsights.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/teamInsights.js`:

```javascript
// Pure, dependency-free engine for "Team Insights": natural clean-break cut lines,
// bubble players around each cut, and a recommended lean. Game (scrimmage) play is
// prioritized over testing, because the common association fear is a player who
// "tests well but plays poorly." No DB/request concerns — unit-tested in isolation.

const DEFAULTS = { WINDOW: 5, CLEAN_RATIO: 1.5, MIN_GAP: 1.0, DIVERGENCE: 15 };

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const avg = (nums) => nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

/** Per-athlete signals derived from the rankings payload. */
export function buildSignals(athlete, sessions) {
  const typeByNum = {};
  for (const s of sessions) typeByNum[s.session_number] = s.session_type === "testing" ? "testing" : "game";
  const testing = [], game = [];
  for (const [num, sd] of Object.entries(athlete.session_scores || {})) {
    if (sd == null || sd.normalized_score == null) continue;
    const t = typeByNum[num] || (sd.source === "testing" ? "testing" : "game");
    (t === "testing" ? testing : game).push(sd.normalized_score);
  }
  const testingScore = avg(testing);
  const gameScore = avg(game);
  const divergence = (gameScore != null && testingScore != null) ? gameScore - testingScore : 0;
  const hist = athlete.rank_history || [];
  const trend = hist.length >= 2 ? (hist[0] - hist[hist.length - 1]) : 0; // rank dropped (improved) → positive
  return {
    id: athlete.id,
    name: `${athlete.last_name}, ${athlete.first_name}`,
    rank: athlete.rank,
    composite: athlete.weighted_total,
    testingScore, gameScore, divergence, trend,
    agreement: athlete.agreement_pct ?? null,
  };
}

/** Interior cut positions from team sizes: [17,17] → [17]; [12,11,11] → [12,23]. */
function cutPositions(teamSizes) {
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < teamSizes.length - 1; i++) { acc += teamSizes[i]; cuts.push(acc); }
  return cuts;
}

/** For each interior cut, find the cleanest score gap within the search window. */
export function detectBreaks(ranked, teamSizes, opts = {}) {
  const { WINDOW, CLEAN_RATIO, MIN_GAP } = { ...DEFAULTS, ...opts };
  const N = ranked.length;
  const comps = ranked.map(r => r.composite);
  const allGaps = [];
  for (let i = 0; i < N - 1; i++) allGaps.push(comps[i] - comps[i + 1]);
  const localMedian = median(allGaps) || 0.0001;

  return cutPositions(teamSizes).map((c, idx) => {
    const lo = Math.max(1, c - WINDOW);
    const hi = Math.min(N - 1, c + WINDOW);
    let best = { pos: c, gap: -Infinity };
    for (let i = lo; i <= hi; i++) {
      const gap = comps[i - 1] - comps[i]; // gap after rank i
      if (gap > best.gap) best = { pos: i, gap };
    }
    const cleanliness = best.gap / localMedian;
    return {
      intendedCut: c,
      suggestedCut: best.pos,
      gap: Math.round(best.gap * 10) / 10,
      cleanliness: Math.round(cleanliness * 10) / 10,
      isClean: cleanliness >= CLEAN_RATIO && best.gap >= MIN_GAP,
      teamAbove: idx + 1,
      teamBelow: idx + 2,
    };
  });
}

/** Recommended lean for one bubble player. Game play dominates; agreement gates confidence. */
export function computeLean(signals, opts = {}) {
  const { DIVERGENCE } = { ...DEFAULTS, ...opts };
  let score = 0;
  const reasons = [];
  const d = signals.divergence || 0;

  if (d <= -DIVERGENCE) { score -= 2; reasons.push("Tests well but plays down — game play prioritized"); }
  else if (d >= DIVERGENCE) { score += 2; reasons.push("Plays better than they test"); }
  else if (Math.abs(d) >= DIVERGENCE / 2) {
    score += Math.sign(d);
    reasons.push(d < 0 ? "Slightly stronger in testing than games" : "Slightly stronger in games than testing");
  }

  if (signals.trend > 0) { score += 1; reasons.push("Trending up across sessions"); }
  else if (signals.trend < 0) { score -= 1; reasons.push("Trending down across sessions"); }

  const lean = score >= 2 ? "up" : score <= -2 ? "down" : "tossup";

  const ag = signals.agreement;
  const confidence = ag == null ? "med" : ag >= 80 ? "high" : ag >= 60 ? "med" : "low";
  const needsReview = ag != null && ag < 60;
  if (needsReview) reasons.push("Evaluators disagreed — worth a human look");
  if (!reasons.length) reasons.push("Balanced profile near the cut");

  return { lean, confidence, needsReview, reasons };
}

/** Full analysis: clean breaks + bubble players (with leans) for the given team sizes. */
export function analyzeTeams(ranked, sessions, teamSizes, opts = {}) {
  const { WINDOW } = { ...DEFAULTS, ...opts };
  const breaks = detectBreaks(ranked, teamSizes, opts);
  const signalsByRank = ranked.map(a => buildSignals(a, sessions));

  const bubbles = [];
  breaks.forEach((b, bi) => {
    for (const s of signalsByRank) {
      if (Math.abs(s.rank - b.suggestedCut) <= WINDOW && s.rank !== 0) {
        // only include each player once, tagged to the nearest boundary
        if (bubbles.find(x => x.id === s.id)) continue;
        bubbles.push({
          ...s,
          boundary: bi,
          sideAboveCut: s.rank <= b.suggestedCut,
          ...computeLean(s, opts),
        });
      }
    }
  });

  return { breaks, bubbles };
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/teamInsights.test.js` → all PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/teamInsights.js tests/unit/teamInsights.test.js
git commit -m "feat(insights): teamInsights engine — clean breaks, bubble players, game-prioritized lean"
```

---

## Task 2: Insights tab UI (build-verified)

**Files:** Modify `src/components/CategoryDashboard.jsx`

Read the component first to learn: the rankings query variable (the `athletes`/`ranked` + `sessions` data already fetched), the `tabs` array, the `role`/`canManage` props, and the styling conventions. The engine runs client-side on that already-fetched data — do NOT add a fetch.

- [ ] **Step 1:** Import the engine at the top of the file:
```javascript
import { analyzeTeams } from "@/lib/teamInsights";
```

- [ ] **Step 2:** Add an "Insights" tab to the `tabs` array (after "reports"):
```javascript
    { id: "insights", label: "Insights", icon: BarChart3 },
```
(Use an icon already imported in the file; `BarChart3` is used for Rankings — reuse it or another already-imported lucide icon.)

- [ ] **Step 3:** Add team-structure state near the other `useState`s:
```javascript
  const [teamCount, setTeamCount] = useState(2);
```

- [ ] **Step 4:** Derive the analysis from the already-fetched rankings data. Find the variable holding the ranked athletes (e.g. the rankings query `data?.athletes` — confirm the exact name) and the `sessions`. Compute insights with `useMemo`:
```javascript
  const rankedForInsights = (rankingsData?.athletes || []).filter(a => a.weighted_total != null);
  const insights = useMemo(() => {
    const n = rankedForInsights.length;
    if (!n || teamCount < 2) return { breaks: [], bubbles: [] };
    const base = Math.floor(n / teamCount), rem = n % teamCount;
    const sizes = Array.from({ length: teamCount }, (_, i) => base + (i < rem ? 1 : 0));
    return analyzeTeams(rankedForInsights, rankingsData?.sessions || [], sizes, {});
  }, [rankedForInsights, rankingsData?.sessions, teamCount]);
```
Adapt `rankingsData` to the real query variable name found in the file. Add `useMemo` to the React import if needed.

- [ ] **Step 5:** Render the Insights tab body (add an `activeTab === "insights"` block alongside the others). It must:
  - Show an empty state when `rankedForInsights.length === 0`: "Insights appear once scores are in." (Don't crash.)
  - A control to set `teamCount` (number input or +/- stepper), labeled "Number of teams."
  - For each `insights.breaks` entry: a card stating the cut — if `isClean`: "Clean break after #{suggestedCut} — {gap}-pt gap ({cleanliness}× the typical)"; else: "No clean break near the #{intendedCut} cut — judgment call." 
  - Under each break, the bubble players near it (`insights.bubbles.filter(x => x.boundary === <index>)`), each row showing: name, a lean badge (Up = green, Down = red, Toss-up = gray), confidence, the `reasons` (joined), and mini-stats (composite, game vs testing scores, agreement). If `needsReview`, show a small "needs a look" tag.
  - Keep styling consistent with the existing tabs (reuse table/card classes already in the file).

- [ ] **Step 6: Build + suite.** `npm run build` (success) + `npm run test` (green — prior + the new engine tests).

- [ ] **Step 7: Commit.**
```bash
git add "src/components/CategoryDashboard.jsx"
git commit -m "feat(insights): Insights tab — clean breaks + bubble players + recommended lean"
```

---

## Task 3: Verify + hand off
- [ ] `npm run test` green + `npm run build` clean. Controller reviews, then pushes branch / opens PR per user direction.

---

## Self-Review
- Clean breaks → `detectBreaks` (Task 1) + break cards (Task 2). ✓
- Bubble players → `analyzeTeams` bubbles (Task 1) + bubble rows (Task 2). ✓
- Recommendation w/ game prioritized → `computeLean` (divergence dominant) + headline test. ✓
- Lives in Insights tab; no new API; runs on existing data. ✓
- Placeholders: engine code complete; UI step explicitly tells implementer to confirm the real rankings-data variable name. ✓
- Names: `analyzeTeams`/`detectBreaks`/`computeLean`/`buildSignals` consistent across lib, tests, and UI import. ✓
