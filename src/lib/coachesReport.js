import sql from "@/lib/db";
import { computeCategoryRankings } from "@/lib/rankings";

// ── Coaches (Team Development) Report ────────────────────────────────────────
// A season-planning read for a coach, built from the full evaluation dataset —
// WITHOUT giving away the paid parent report's value. It never prints a score,
// a percentile, or a field/category ranking. Instead it turns the underlying
// signals into narrative a coach can act on:
//   • a "coach's read" summary,
//   • data-driven takeaways ("the data suggests …"),
//   • prioritized development focus (from evaluator notes),
//   • the team's relative skill identity (which of the 4 skills it leans on /
//     needs — order only, never numbers), roster shape, and within-team spread,
//   • the within-team ranking (teammates ordered relative to each other).

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

// Maps a skill name to plain coaching language + a practice focus. Keyed by a
// loose match so it survives the small naming variants across categories.
function skillGuide(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("skat")) return { noun: "skating and pace", focus: "edgework, transitions, and first-step quickness" };
  if (n.includes("puck")) return { noun: "puck skills", focus: "small-area puck-touch reps and protecting the puck under pressure" };
  if (n.includes("iq") || n.includes("sense") || n.includes("aware") || n.includes("anticip")) return { noun: "hockey sense", focus: "situational small games and positional reads" };
  if (n.includes("compete") || n.includes("effort") || n.includes("battle")) return { noun: "compete level", focus: "battle drills, net-front presence, and board work" };
  return { noun: name || "skills", focus: "targeted skill reps" };
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const stdev = (xs) => { const m = mean(xs); return (m == null || xs.length < 2) ? 0 : Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length); };
const listWords = (arr) => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];

export async function buildCoachesReport(catId) {
  const [category] = await sql`
    SELECT ac.id, ac.name, ac.scoring_scale, ac.organization_id, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}`;
  if (!category) return null;
  const scale = parseFloat(category.scoring_scale || 10);

  const rankData = await computeCategoryRankings(catId);
  const standing = {}, totalById = {};
  (rankData.athletes || []).forEach(a => { standing[a.id] = a.rank ?? 9999; if (a.weighted_total != null) totalById[a.id] = a.weighted_total; });
  (rankData.goalies || []).forEach(a => { standing[a.id] = a.rank ?? 9999; });

  const teams = await sql`
    SELECT id, name, coach_name, coach_email, rank_order
    FROM teams WHERE age_category_id = ${catId} ORDER BY rank_order, name`;
  const rosters = await sql`
    SELECT tr.team_id, tr.athlete_id, a.first_name, a.last_name, a.position
    FROM team_rosters tr JOIN athletes a ON a.id = tr.athlete_id
    WHERE tr.age_category_id = ${catId}`;
  const rosterByTeam = {};
  for (const r of rosters) (rosterByTeam[r.team_id] ||= []).push(r);

  // Per-skill (scoring_category) average per athlete — INTERNAL ONLY. Used to
  // derive relative skill identity; the numbers themselves never leave here.
  const skillRows = await sql`
    SELECT cs.scoring_category_id, sc.name AS skill, sc.display_order, cs.athlete_id, AVG(cs.score) AS avg_score
    FROM category_scores cs JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
    WHERE cs.age_category_id = ${catId}
    GROUP BY cs.scoring_category_id, sc.name, sc.display_order, cs.athlete_id`;
  const skillMap = {};
  for (const r of skillRows) {
    const s = (skillMap[r.scoring_category_id] ||= { name: r.skill, order: r.display_order, byAthlete: {} });
    s.byAthlete[r.athlete_id] = parseFloat(r.avg_score) / scale; // 0..1, internal
  }
  const skaterIds = new Set((rankData.athletes || []).map(a => a.id));
  const skills = Object.values(skillMap)
    .filter(s => Object.keys(s.byAthlete).some(aid => skaterIds.has(Number(aid))))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const noteRows = await sql`
    SELECT athlete_id, note_text FROM player_notes
    WHERE age_category_id = ${catId} AND note_text IS NOT NULL AND length(trim(note_text)) > 0`;
  const notesByAthlete = {};
  for (const n of noteRows) (notesByAthlete[n.athlete_id] ||= []).push(n.note_text);

  const topTeam = teams[0];

  const buildTeam = (t) => {
    const roster = (rosterByTeam[t.id] || []);
    const ids = roster.map(r => r.athlete_id);
    const ranking = roster.slice()
      .sort((a, b) => (standing[a.athlete_id] ?? 9999) - (standing[b.athlete_id] ?? 9999))
      .map((r, i) => ({ within_rank: i + 1, name: `${r.last_name}, ${r.first_name}`, position: r.position || null }));

    // Roster shape
    const shape = { forwards: 0, defense: 0, goalies: 0 };
    for (const r of roster) {
      if (r.position === "defense") shape.defense++;
      else if (r.position === "goalie") shape.goalies++;
      else shape.forwards++;
    }
    let shapeNote = null;
    const skatersN = shape.forwards + shape.defense;
    if (skatersN >= 6) {
      if (shape.defense > 0 && shape.forwards / shape.defense > 2.6) shapeNote = "blue-line-light — plan a structure that protects a thin back end and leans on forward support down low";
      else if (shape.defense > 0 && shape.forwards / shape.defense < 1.6) shapeNote = "deep on the blue line — you can run an active D and rotate pairings hard";
      else shapeNote = "a balanced forward/defence split — you have the pieces to run four lines evenly";
    }

    // Relative skill identity (order only — never numbers). Two tiers: a firm
    // "strength/growth" when the skills clearly separate, a soft "leans toward"
    // when the group is fairly even but still tilts one way.
    let strengths = [], growth = [], skillStrong = false;
    if (skills.length >= 3 && ids.length >= 3) {
      const ranked = skills
        .map(s => ({ name: s.name, avg: mean(ids.map(id => s.byAthlete[id]).filter(v => v != null)) }))
        .filter(s => s.avg != null)
        .sort((a, b) => b.avg - a.avg);
      if (ranked.length >= 3) {
        const spread = ranked[0].avg - ranked[ranked.length - 1].avg;
        if (spread >= 0.006) {
          skillStrong = spread >= 0.025;
          strengths = ranked.slice(0, (skillStrong && ranked.length >= 4) ? 2 : 1).map(s => s.name);
          growth = [ranked[ranked.length - 1].name];
        }
      }
    }

    // Within-team spread shape (from internal totals; no numbers exposed)
    let spreadLabel = null, spreadNote = null;
    const totals = ids.map(id => totalById[id]).filter(v => v != null);
    if (totals.length >= 4) {
      const cv = mean(totals) > 0 ? stdev(totals) / mean(totals) : 0;
      if (cv < 0.08) { spreadLabel = "a tightly matched group"; spreadNote = "roll your lines evenly — there's no steep drop-off to hide"; }
      else if (cv > 0.18) { spreadLabel = "a clear top tier over a development group"; spreadNote = "you can lean on your top unit in tight games, but build in reps that pull the development group up"; }
      else { spreadLabel = "a balanced spread top to bottom"; spreadNote = "you have flexibility to match lines to situations"; }
    }

    // Themes
    const themes = extractThemes(ids.flatMap(id => notesByAthlete[id] || []));

    // ── Takeaways ("the data suggests …") ──────────────────────────────
    const takeaways = [];
    if (strengths.length) {
      const gs = strengths.map(s => skillGuide(s).noun);
      takeaways.push(skillStrong
        ? `This group's calling card is ${listWords(gs)} — build a game plan that plays to it and lets them dictate pace.`
        : `Across an even group, the team leans slightly toward ${listWords(gs)} — a modest edge to build early identity around.`);
    }
    if (growth.length) {
      const g = skillGuide(growth[0]);
      takeaways.push(skillStrong
        ? `The clearest shared growth area is ${g.noun}. The data suggests carving out dedicated early-season reps on ${g.focus}.`
        : `${g.noun[0].toUpperCase() + g.noun.slice(1)} grades out as the softest area of an otherwise even group — worth prioritizing ${g.focus} early.`);
    }
    if (themes.length) {
      const t2 = themes.slice(0, 2).map(x => x.theme.toLowerCase());
      takeaways.push(`Across the group, evaluators most often flagged ${listWords(t2)} — make it a recurring weekly practice theme rather than a one-off.`);
    }
    if (shapeNote) takeaways.push(`Roster shape: you're ${shapeNote}.`);
    if (spreadNote) takeaways.push(`This is ${spreadLabel} — ${spreadNote}.`);

    // ── Coach's read (2–3 sentence synthesis) ──────────────────────────
    let summary = "";
    if (strengths.length || growth.length || themes.length) {
      let s1 = "";
      if (strengths.length && growth.length) {
        s1 = `${skillStrong ? "Built around" : "Leaning slightly on"} ${listWords(strengths.map(s => skillGuide(s).noun))}, with ${skillGuide(growth[0]).noun} the area to develop.`;
      } else if (strengths.length) {
        s1 = `${skillStrong ? "Built around" : "Leaning slightly on"} ${listWords(strengths.map(s => skillGuide(s).noun))}.`;
      } else if (growth.length) {
        s1 = `Its main area to develop is ${skillGuide(growth[0]).noun}.`;
      }
      let s2 = themes.length ? ` Evaluators kept coming back to ${listWords(themes.slice(0, 3).map(x => x.theme.toLowerCase()))} — that's where a season plan should start.` : "";
      let s3 = spreadLabel ? ` It profiles as ${spreadLabel}.` : "";
      summary = (s1 + s2 + s3).trim();
    }

    return {
      id: t.id, name: t.name, coach_name: t.coach_name, coach_email: t.coach_email,
      rank_order: t.rank_order, is_top: topTeam && t.id === topTeam.id,
      player_count: ranking.length,
      summary, takeaways,
      strengths: strengths.map(s => skillGuide(s).noun),
      growth: growth.map(s => skillGuide(s).noun),
      shape, shapeNote, spreadLabel,
      themes, ranking,
    };
  };

  const teamReports = teams.map(buildTeam);
  const rosteredIds = new Set(rosters.map(r => r.athlete_id));
  const unrostered = (rankData.athletes || []).filter(a => !rosteredIds.has(a.id)).length;

  return {
    category: {
      id: category.id, name: category.name, org_name: category.org_name,
      skater_count: (rankData.athletes || []).length, team_count: teams.length,
      phase: rankData.phase, has_scores: rankData.has_scores,
    },
    teams: teamReports, unrostered,
  };
}
