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
  const trend = hist.length >= 2 ? (hist[0] - hist[hist.length - 1]) : 0;
  return {
    id: athlete.id,
    name: `${athlete.last_name}, ${athlete.first_name}`,
    rank: athlete.rank,
    composite: athlete.weighted_total,
    testingScore, gameScore, divergence, trend,
    agreement: athlete.agreement_pct ?? null,
  };
}

function cutPositions(teamSizes) {
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < teamSizes.length - 1; i++) { acc += teamSizes[i]; cuts.push(acc); }
  return cuts;
}

/** Convert interior cut positions into team sizes. cutsToSizes([16], 34) → [16, 18]. */
export function cutsToSizes(cuts, total) {
  const valid = [...new Set(cuts.filter(c => c > 0 && c < total))].sort((a, b) => a - b);
  const sizes = [];
  let prev = 0;
  for (const c of valid) { sizes.push(c - prev); prev = c; }
  sizes.push(total - prev);
  return sizes;
}

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
      const gap = comps[i - 1] - comps[i];
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

/** Snake-distribute `count` items across `teamCount` teams. Returns team index per item.
 *  snakeDistribute(5, 2) → [0,1,1,0,0]. */
export function snakeDistribute(count, teamCount) {
  const out = [];
  if (teamCount < 1) return out;
  let idx = 0, dir = 1;
  for (let i = 0; i < count; i++) {
    out.push(idx);
    if (teamCount === 1) continue;
    if (dir === 1) {
      if (idx === teamCount - 1) { dir = -1; } else { idx++; continue; }
    } else {
      if (idx === 0) { dir = 1; } else { idx--; continue; }
    }
    // direction just flipped at an edge → stay on the same team for the turn (snake)
  }
  return out;
}

export function analyzeTeams(ranked, sessions, teamSizes, opts = {}) {
  const { WINDOW } = { ...DEFAULTS, ...opts };
  const breaks = detectBreaks(ranked, teamSizes, opts);
  const signalsByRank = ranked.map(a => buildSignals(a, sessions));

  const bubbles = [];
  breaks.forEach((b, bi) => {
    for (const s of signalsByRank) {
      if (Math.abs(s.rank - b.suggestedCut) <= WINDOW && s.rank !== 0) {
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
