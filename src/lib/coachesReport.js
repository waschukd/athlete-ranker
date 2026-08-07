import sql from "@/lib/db";
import { computeCategoryRankings } from "@/lib/rankings";

// ── Coaches (Team Development) Report ────────────────────────────────────────
// A per-team snapshot a coach can plan a season around — WITHOUT giving away the
// paid parent report's value. Deliberately excludes scores, percentiles, and any
// field/category comparison. It carries only:
//   • within-team ranking (how the roster orders relative to teammates), and
//   • development THEMES (what evaluators flagged most, aggregated from notes —
//     never the verbatim notes).
// No numeric score ever enters the payload, so nothing leaks via the network tab.

const STOPWORDS = new Set(
  ("a an the and or but of to in on for with at by from as is are was were be been being " +
   "he she they his her their him them it its this that these those who whom which what " +
   "will would can could should may might must has have had do does did not no yet still " +
   "more most less least very much many few some any each every both all more into out up " +
   "down over under again then than so too also just like well good great needs need needs " +
   "player players kid skater work working works focus area areas keep keeps kept get gets " +
   "getting show shows showing continue continues improving improve improves session sessions")
    .split(/\s+/)
);

const PHRASES = [
  "puck control", "puck protection", "first step", "gap control", "body position",
  "compete level", "battle level", "net front", "board battles", "stick handling",
  "shot release", "edge work", "back check", "fore check", "defensive zone",
  "puck touches", "one on one", "small area",
];

function extractThemes(notes, limit = 8) {
  const blob = notes.map(n => (n || "").toLowerCase()).join("  •  ");
  if (!blob.trim()) return [];
  const counts = new Map();
  for (const p of PHRASES) {
    let from = 0, c = 0, i;
    while ((i = blob.indexOf(p, from)) !== -1) { c++; from = i + p.length; }
    if (c > 0) counts.set(p, (counts.get(p) || 0) + c * 2);
  }
  for (const raw of blob.split(/[^a-z]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([theme, count]) => ({ theme: theme.replace(/\b\w/g, m => m.toUpperCase()), count }));
}

export async function buildCoachesReport(catId) {
  const [category] = await sql`
    SELECT ac.id, ac.name, ac.organization_id, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}`;
  if (!category) return null;

  // Live standings — used ONLY to order teammates relative to each other. The
  // underlying rank/score never leaves this function.
  const rankData = await computeCategoryRankings(catId);
  const standing = {}; // athlete_id → overall category rank (lower = stronger)
  (rankData.athletes || []).forEach(a => { standing[a.id] = a.rank ?? 9999; });
  (rankData.goalies || []).forEach(a => { standing[a.id] = a.rank ?? 9999; });

  const teams = await sql`
    SELECT id, name, coach_name, coach_email, rank_order
    FROM teams WHERE age_category_id = ${catId}
    ORDER BY rank_order, name`;
  const rosters = await sql`
    SELECT tr.team_id, tr.athlete_id, a.first_name, a.last_name, a.position
    FROM team_rosters tr JOIN athletes a ON a.id = tr.athlete_id
    WHERE tr.age_category_id = ${catId}`;
  const rosterByTeam = {};
  for (const r of rosters) (rosterByTeam[r.team_id] ||= []).push(r);

  const noteRows = await sql`
    SELECT athlete_id, note_text FROM player_notes
    WHERE age_category_id = ${catId} AND note_text IS NOT NULL AND length(trim(note_text)) > 0`;
  const notesByAthlete = {};
  for (const n of noteRows) (notesByAthlete[n.athlete_id] ||= []).push(n.note_text);

  const topTeam = teams[0];
  const teamReports = teams.map(t => {
    // Order teammates by their overall standing, then expose ONLY the ordinal.
    const ranking = (rosterByTeam[t.id] || [])
      .slice()
      .sort((a, b) => (standing[a.athlete_id] ?? 9999) - (standing[b.athlete_id] ?? 9999))
      .map((r, i) => ({
        within_rank: i + 1,
        name: `${r.last_name}, ${r.first_name}`,
        position: r.position || null,
      }));
    const ids = (rosterByTeam[t.id] || []).map(r => r.athlete_id);
    const themes = extractThemes(ids.flatMap(id => notesByAthlete[id] || []));
    return {
      id: t.id, name: t.name, coach_name: t.coach_name, coach_email: t.coach_email,
      rank_order: t.rank_order, is_top: topTeam && t.id === topTeam.id,
      player_count: ranking.length,
      ranking, themes,
    };
  });

  const rosteredIds = new Set(rosters.map(r => r.athlete_id));
  const unrostered = (rankData.athletes || []).filter(a => !rosteredIds.has(a.id)).length;

  return {
    category: {
      id: category.id, name: category.name, org_name: category.org_name,
      skater_count: (rankData.athletes || []).length, team_count: teams.length,
      phase: rankData.phase, has_scores: rankData.has_scores,
    },
    teams: teamReports,
    unrostered,
  };
}
