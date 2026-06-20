// Final-session contention analysis (pure, unit-tested).
//
// Given the live ranking (each athlete's per-session normalized scores + the
// category's session weights) and configured roster target(s), Monte-Carlos the
// remaining session(s) to classify every athlete as:
//   • locked  — realistically can't fall out of the spot they hold
//   • out     — realistically can't climb into a kept spot
//   • bubble  — could still cross a cut line → MUST play the final game(s)
//
// "Realistically" = probabilistic: each athlete's remaining game(s) are drawn from
// a distribution centred on their established level with spread = how much players
// in THIS category actually move session-to-session. A player is settled when the
// chance of crossing a line is below the confidence threshold (default 5%).
//
// Pure functions only — no DB, no request context. The route feeds it the output
// of computeCategoryRankings() (skater pool or goalie pool) + roster targets.

// Deterministic PRNG so the same data yields the same recommendation (stable, and
// testable). mulberry32 + Box–Muller, matching the seed scripts.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng, mean, sd) {
  const u = Math.max(1e-9, rng()), v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Accept a single number ("top 17"), an array of numbers, or [{name,size}] tiers.
export function normalizeTargets(targets) {
  if (targets == null) return [];
  if (typeof targets === "number") return targets > 0 ? [{ name: "Roster", size: Math.floor(targets) }] : [];
  if (Array.isArray(targets)) {
    return targets
      .map((t, i) => (typeof t === "number"
        ? { name: `Tier ${i + 1}`, size: Math.floor(t) }
        : { name: t.name || `Tier ${i + 1}`, size: Math.floor(Number(t.size)) }))
      .filter(t => t.size > 0);
  }
  if (typeof targets === "object" && targets.size) return [{ name: targets.name || "Roster", size: Math.floor(Number(targets.size)) }];
  return [];
}

// Pooled within-athlete spread of per-session normalized scores (0..100). This is
// the realistic "how much does a player bounce game to game" used as the sim noise.
export function estimateMovementSd(athletes, sessions) {
  const devs = [];
  for (const a of athletes) {
    const ss = a.session_scores || {};
    const vals = sessions.map(s => ss[s.session_number]?.normalized_score).filter(v => v != null);
    if (vals.length < 2) continue;
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    for (const v of vals) devs.push((v - mean) ** 2);
  }
  if (devs.length < 4) return 8; // sensible default on a 0..100 scale until we have data
  return Math.sqrt(devs.reduce((x, y) => x + y, 0) / devs.length);
}

// ranking: { athletes:[{id,first_name,last_name,position,rank,weighted_total,session_scores}], sessions:[{session_number,weight_percentage}], completed_sessions:[n] }
// opts: { rosterTargets, confidence=0.05, runs=2000, seed?, movementSd? }
export function analyzeContention(ranking, opts = {}) {
  const sessions = ranking?.sessions || [];
  const pool = ranking?.athletes || [];
  const completed = new Set((ranking?.completed_sessions || []).map(Number));
  const confidence = opts.confidence ?? 0.05;
  const runs = opts.runs ?? 2000;
  const targets = normalizeTargets(opts.rosterTargets);

  if (!pool.length) return { dataReady: false, reason: "no_athletes" };
  if (!targets.length) return { dataReady: false, reason: "no_roster_targets" };

  const remaining = sessions.filter(s => !completed.has(Number(s.session_number)) && parseFloat(s.weight_percentage) > 0);
  const scoredSessions = sessions.filter(s => completed.has(Number(s.session_number)));
  if (!scoredSessions.length) return { dataReady: false, reason: "no_scored_sessions" };
  if (!remaining.length) return { dataReady: false, reason: "no_remaining_sessions" };

  const N = pool.length;
  let acc = 0;
  const lines = targets.map(t => { acc += t.size; return { name: t.name, size: t.size, at: Math.min(acc, N) }; });
  const totalKept = Math.min(acc, N);
  const sd = opts.movementSd ?? estimateMovementSd(pool, sessions);
  const rng = mulberry32(opts.seed ?? (N * 101 + lines.length * 7 + 13));

  // Each athlete's established level (mean of attended normalized scores) + attended weight set.
  const players = pool.map(a => {
    const ss = a.session_scores || {};
    const attended = sessions
      .filter(s => ss[s.session_number]?.normalized_score != null)
      .map(s => ({ w: parseFloat(s.weight_percentage) / 100, score: ss[s.session_number].normalized_score }));
    const lvl = attended.length ? attended.reduce((x, y) => x + y.score, 0) / attended.length : 50;
    return { a, attended, lvl };
  });

  const inLineCounts = players.map(() => new Array(lines.length).fill(0));
  for (let r = 0; r < runs; r++) {
    const totals = players.map((p, idx) => {
      let wsum = 0, wtot = 0;
      for (const s of p.attended) { wsum += s.score * s.w; wtot += s.w; }
      for (const s of remaining) {
        const w = parseFloat(s.weight_percentage) / 100;
        wsum += clamp(gauss(rng, p.lvl, sd), 0, 100) * w; wtot += w;
      }
      return { idx, total: wtot > 0 ? wsum / wtot : 0 };
    });
    totals.sort((x, y) => y.total - x.total);
    totals.forEach((t, pos) => {
      const rank = pos + 1;
      for (let li = 0; li < lines.length; li++) if (rank <= lines[li].at) inLineCounts[t.idx][li]++;
    });
  }

  const playersOut = players.map((p, idx) => {
    const pByLine = inLineCounts[idx].map(c => c / runs);
    const pKept = pByLine[lines.length - 1];
    // contested if the final game could realistically swing them across ANY cut line
    let contested = false;
    for (let li = 0; li < lines.length; li++) { const pin = pByLine[li]; if (pin > confidence && pin < 1 - confidence) { contested = true; break; } }
    let projectedTier = null;
    for (let li = 0; li < lines.length; li++) if (p.a.rank <= lines[li].at) { projectedTier = lines[li].name; break; }
    const status = contested ? "bubble" : pKept <= confidence ? "out" : "locked";
    return {
      id: p.a.id, first_name: p.a.first_name, last_name: p.a.last_name, position: p.a.position,
      rank: p.a.rank, weighted_total: p.a.weighted_total,
      status, projected_tier: projectedTier || "Out",
      p_kept: Math.round(pKept * 100), p_by_line: pByLine.map(v => Math.round(v * 100)),
    };
  }).sort((x, y) => x.rank - y.rank);

  return {
    dataReady: true,
    confidence, runs, movement_sd: Math.round(sd * 10) / 10,
    lines, total_kept: totalKept,
    remaining_sessions: remaining.map(s => ({ session_number: s.session_number, weight: s.weight_percentage })),
    players: playersOut,
    recommended_sits: playersOut.filter(p => p.status !== "bubble").map(p => p.id),
    must_play: playersOut.filter(p => p.status === "bubble").map(p => p.id),
    counts: {
      locked: playersOut.filter(p => p.status === "locked").length,
      bubble: playersOut.filter(p => p.status === "bubble").length,
      out: playersOut.filter(p => p.status === "out").length,
    },
  };
}
