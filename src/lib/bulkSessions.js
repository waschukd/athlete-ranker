// Session-structure derivation for bulk association onboarding. Pure (no DB), so
// it's unit-testable and reusable by the commit route.

// A testing session runs objective drills (testers, no player evaluators). Goalie
// skills are their own testing-style block. Everything else (scrimmage, skills) is
// SCORED by evaluators.
export const isTesting = (t) => t === "testing" || t === "goalie_skills";

// Derive a division's session structure from its schedule rows.
// PRIMARY: honor the file's explicit "Session #" column — one session per distinct
// number, typed testing vs scored (scrimmage/skills) by its rows. This is what an
// association means by "session": a round of evaluation, even when its groups play
// across several dates (e.g. U18 house). Testing is capped at 10% TOTAL; scored
// sessions split the remaining 90% evenly.
// FALLBACK (no Session # column): one testing session + one scored session per
// distinct scored date.
// Returns { sessions:[{session_number,type,weight}], sessionForRow(row)->number }.
export function deriveSessions(rows) {
  const dated = rows.filter(r => r.date);

  // ── PRIMARY: explicit Session # column ──
  const hasExplicit = dated.some(r => r.session_number != null && r.session_number !== "" && !Number.isNaN(parseInt(r.session_number)));
  if (hasExplicit) {
    const byNum = new Map();
    for (const r of dated) {
      const sn = parseInt(r.session_number);
      if (Number.isNaN(sn)) continue;
      if (!byNum.has(sn)) byNum.set(sn, { session_number: sn, testing: false });
      if (isTesting(r.session_type)) byNum.get(sn).testing = true;
    }
    const list = [...byNum.values()].sort((a, b) => a.session_number - b.session_number);
    const testingCount = list.filter(s => s.testing).length;
    const scoredCount = list.length - testingCount;
    // Testing tops out at 10% total; if there are no scored sessions it takes 100%.
    const totalTesting = testingCount ? (scoredCount ? 10 : 100) : 0;
    const perTesting = testingCount ? Math.round(totalTesting / testingCount) : 0;
    const perScored = scoredCount ? Math.floor((100 - totalTesting) / scoredCount) : 0;
    let used = 0;
    const sessions = list.map(s => {
      const weight = s.testing ? perTesting : perScored;
      used += weight;
      return { session_number: s.session_number, type: s.testing ? "testing" : "scrimmage", weight };
    });
    // Absorb any rounding remainder into the last scored session (else last session).
    if (sessions.length && used !== 100) {
      const target = [...sessions].reverse().find(s => s.type === "scrimmage") || sessions[sessions.length - 1];
      target.weight += 100 - used;
    }
    return { sessions, sessionForRow: (r) => parseInt(r.session_number) || 1 };
  }

  // ── FALLBACK: no Session # column → group scored rows by distinct date ──
  const scrimDates = [...new Set(dated.filter(r => !isTesting(r.session_type)).map(r => r.date))].sort();
  const hasTesting = dated.some(r => isTesting(r.session_type));
  const sessions = [];
  let n = 1;
  const testingNum = hasTesting ? n++ : null;
  const scrimNums = new Map();
  for (const d of scrimDates) scrimNums.set(d, n++);
  const scrimCount = scrimDates.length;
  const testingWeight = hasTesting && scrimCount ? 10 : (hasTesting ? 100 : 0);
  const scrimWeight = scrimCount ? Math.round((100 - testingWeight) / scrimCount) : 0;
  if (hasTesting) sessions.push({ session_number: testingNum, type: "testing", weight: testingWeight });
  scrimDates.forEach((d, i) => sessions.push({ session_number: scrimNums.get(d), type: "scrimmage", weight: i === scrimCount - 1 ? (100 - testingWeight - scrimWeight * (scrimCount - 1)) : scrimWeight }));
  if (!sessions.length) return { sessions: [
    { session_number: 1, type: "testing", weight: 10 }, { session_number: 2, type: "scrimmage", weight: 30 },
    { session_number: 3, type: "scrimmage", weight: 30 }, { session_number: 4, type: "scrimmage", weight: 30 },
  ], sessionForRow: (r) => (isTesting(r.session_type) ? 1 : 2) };
  const sessionForRow = (r) => isTesting(r.session_type) ? (testingNum || 1) : (scrimNums.get(r.date) || sessions.find(s => s.type === "scrimmage")?.session_number || 1);
  return { sessions, sessionForRow };
}
