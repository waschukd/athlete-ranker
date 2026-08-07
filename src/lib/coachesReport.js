import sql from "@/lib/db";
import { computeCategoryRankings } from "@/lib/rankings";
import { normalizeScore, round1 } from "@/lib/scoring";

// ── Coaches (Team Development) Report ────────────────────────────────────────
// Aggregates the whole evaluation process into a per-team development snapshot a
// coach can plan a season around: how the team profiles vs the field and the top
// team across each skill, an objective-testing profile, and the development
// THEMES evaluators flagged most — deliberately aggregated, never the verbatim
// notes (those stay in the paid parent report). Free to the association.
//
// buildCoachesReport(catId) → { category, skills, teams:[…], unrostered }
// Each team carries: perSkill {team, category, topTeam}, testing, themes, roster.

// Words we never surface as a "theme" — articles, pronouns, filler, and the
// generic evaluation verbs that appear in almost every note.
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

// A few multi-word focus phrases worth surfacing as a single theme when present.
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
  // Phrase hits first (they're more descriptive than single tokens).
  for (const p of PHRASES) {
    let from = 0, c = 0, i;
    while ((i = blob.indexOf(p, from)) !== -1) { c++; from = i + p.length; }
    if (c > 0) counts.set(p, (counts.get(p) || 0) + c * 2); // weight phrases a touch
  }
  // Single meaningful tokens.
  for (const raw of blob.split(/[^a-z]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)                 // must recur to be a "theme"
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([theme, count]) => ({
      theme: theme.replace(/\b\w/g, m => m.toUpperCase()),
      count,
    }));
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export async function buildCoachesReport(catId) {
  const [category] = await sql`
    SELECT ac.id, ac.name, ac.scoring_scale, ac.organization_id, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}`;
  if (!category) return null;
  const scale = parseFloat(category.scoring_scale || 10);

  // Live rankings → rank / weighted_total / position per athlete.
  const rankData = await computeCategoryRankings(catId);
  const rankById = {};
  const skaters = (rankData.athletes || []);
  const N = skaters.length;
  skaters.forEach(a => { rankById[a.id] = a; });
  // percentile within the skater pool: rank 1 → 100, last → 0
  const pct = (rank) => (N > 1 && rank) ? round1(((N - rank) / (N - 1)) * 100) : null;

  // Teams + rosters (top team = rank_order 1).
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

  // Per-skill (scoring_category) average per athlete — normalized 0–100. Only
  // skills that skaters were actually scored on (naturally drops goalie stations).
  const skillRows = await sql`
    SELECT cs.scoring_category_id, sc.name AS skill, sc.display_order,
           cs.athlete_id, AVG(cs.score) AS avg_score
    FROM category_scores cs
    JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
    WHERE cs.age_category_id = ${catId}
    GROUP BY cs.scoring_category_id, sc.name, sc.display_order, cs.athlete_id`;
  // skillId → { name, order, byAthlete: {athleteId: normalized} }
  const skillMap = {};
  for (const r of skillRows) {
    const s = (skillMap[r.scoring_category_id] ||= { name: r.skill, order: r.display_order, byAthlete: {} });
    s.byAthlete[r.athlete_id] = round1(normalizeScore(parseFloat(r.avg_score), scale));
  }
  // Keep only skills held by skaters (exclude goalie-only stations), ordered.
  const skaterIds = new Set(skaters.map(a => a.id));
  const skills = Object.entries(skillMap)
    .map(([id, s]) => ({ id: Number(id), name: s.name, order: s.order, byAthlete: s.byAthlete }))
    .filter(s => Object.keys(s.byAthlete).some(aid => skaterIds.has(Number(aid))))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const skillAvg = (skill, athleteIds) =>
    mean(athleteIds.map(id => skill.byAthlete[id]).filter(v => v != null));

  // Category-wide and top-team per-skill baselines.
  const allSkaterIds = skaters.map(a => a.id);
  const topTeam = teams[0];
  const topTeamIds = topTeam ? (rosterByTeam[topTeam.id] || []).map(r => r.athlete_id) : [];
  const skillsMeta = skills.map(s => ({
    id: s.id, name: s.name,
    category: skillAvg(s, allSkaterIds),
    topTeam: topTeamIds.length ? skillAvg(s, topTeamIds) : null,
  }));

  // Objective testing: per-athlete best overall_rank → percentile.
  const testRows = await sql`
    SELECT DISTINCT ON (athlete_id) athlete_id, overall_rank
    FROM testing_drill_results WHERE age_category_id = ${catId}
    ORDER BY athlete_id, overall_rank`;
  const testPctById = {};
  const M = testRows.length;
  if (M > 1) for (const r of testRows) testPctById[r.athlete_id] = round1(((M - r.overall_rank) / (M - 1)) * 100);
  const hasTesting = M > 0;

  // Notes per athlete (for team theme aggregation).
  const noteRows = await sql`
    SELECT athlete_id, note_text FROM player_notes
    WHERE age_category_id = ${catId} AND note_text IS NOT NULL AND length(trim(note_text)) > 0`;
  const notesByAthlete = {};
  for (const n of noteRows) (notesByAthlete[n.athlete_id] ||= []).push(n.note_text);

  const buildTeam = (t) => {
    const roster = (rosterByTeam[t.id] || []).map(r => {
      const rk = rankById[r.athlete_id];
      return {
        athlete_id: r.athlete_id,
        name: `${r.last_name}, ${r.first_name}`,
        position: r.position,
        rank: rk?.rank ?? null,
        percentile: rk ? pct(rk.rank) : null,
        weighted_total: rk?.weighted_total ?? null,
        testing_percentile: testPctById[r.athlete_id] ?? null,
        perSkill: Object.fromEntries(skills.map(s => [s.name, s.byAthlete[r.athlete_id] ?? null])),
      };
    }).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    const ids = roster.map(r => r.athlete_id);
    const perSkill = skillsMeta.map(sm => {
      const skill = skills.find(s => s.id === sm.id);
      return {
        name: sm.name,
        team: round1v(skillAvg(skill, ids)),
        category: round1v(sm.category),
        topTeam: round1v(sm.topTeam),
      };
    });
    const teamTestPct = round1v(mean(ids.map(id => testPctById[id]).filter(v => v != null)));
    const teamRankPct = round1v(mean(roster.map(r => r.percentile).filter(v => v != null)));
    const themes = extractThemes(ids.flatMap(id => notesByAthlete[id] || []));

    return {
      id: t.id, name: t.name, coach_name: t.coach_name, coach_email: t.coach_email,
      rank_order: t.rank_order, is_top: topTeam && t.id === topTeam.id,
      player_count: roster.length,
      avg_rank_percentile: teamRankPct,
      testing_percentile: hasTesting ? teamTestPct : null,
      perSkill, themes, roster,
    };
  };

  const teamReports = teams.map(buildTeam);
  const rosteredIds = new Set(rosters.map(r => r.athlete_id));
  const unrostered = skaters.filter(a => !rosteredIds.has(a.id)).length;

  return {
    category: {
      id: category.id, name: category.name, org_name: category.org_name,
      skater_count: N, team_count: teams.length,
      phase: rankData.phase, has_scores: rankData.has_scores,
    },
    skills: skillsMeta.map(s => ({ name: s.name, category: round1v(s.category), topTeam: round1v(s.topTeam) })),
    hasTesting,
    teams: teamReports,
    unrostered,
  };
}

function round1v(v) { return v == null ? null : round1(v); }
