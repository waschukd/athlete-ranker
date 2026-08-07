import sql from "@/lib/db";
import { computeCategoryRankings } from "@/lib/rankings";

// ── Coaches (Team Development) Report ────────────────────────────────────────
// A season-planning read for a coach, from the full evaluation dataset — WITHOUT
// giving away the paid parent report (never a score, percentile, or field rank).
// It turns the signals into things a coach can act on: development priorities
// pulled from evaluator notes, the team's skill identity (only when it's real),
// roster shape, and the within-team ranking.

// Development concepts: evaluator notes are matched to these curated coaching
// areas (by keyword), and we count how many PLAYERS on the team touch each one.
// That yields "First-step quickness — 9 players", never a raw word fragment.
const CONCEPTS = [
  { label: "Skating & edges", keywords: ["skat", "edge", "stride", "crossover", "pivot", "mobility", "agility", "footwork"], focus: "edgework, tight turns, and backward mobility" },
  { label: "First-step quickness", keywords: ["first step", "first-step", "quick", "explosiv", "accelerat", "burst", "jump"], focus: "starts-and-stops and explosive three-stride drills" },
  { label: "Puck control", keywords: ["puck control", "stickhandl", "handling", "puck skill", "dangle", "deke", "soft hands", "puck touch"], focus: "small-area stickhandling and puck-touch reps under pressure" },
  { label: "Puck protection", keywords: ["protect", "shield", "fend", "puck protection", "hold onto", "hang on"], focus: "protecting the puck through contact — wall and shield work" },
  { label: "Shooting & release", keywords: ["shot", "shoot", "release", "one-timer", "wrist", "snap", "finish around the net", "scoring"], focus: "quick-release shooting and net-front finish" },
  { label: "Passing & vision", keywords: ["pass", "playmak", "vision", "distribut", "feed", "saucer", "heads up", "heads-up"], focus: "give-and-go and heads-up passing games" },
  { label: "Compete & battle", keywords: ["compete", "battl", " hard", "physical", "board", "net front", "net-front", "wall", "intensit", "motor", "tenacit", "grit", "forecheck"], focus: "1-on-1 battles, net-front, and board work" },
  { label: "Hockey sense", keywords: ["sense", "hockey iq", " iq", "position", "read", "anticipat", "aware", "support", "gap", "angle", "decision"], focus: "situational small games and positional reads" },
  { label: "Confidence & consistency", keywords: ["confiden", "consisten", "inconsist", "tentativ", "hesitan", "assertive"], focus: "reps that reward decisiveness and build in-game confidence" },
  { label: "Conditioning & pace", keywords: ["condition", "pace", "tempo", "fitness", "tired", "gas", "shift length"], focus: "pace-of-play drills and shift-length conditioning" },
];

function extractConcepts(perPlayerNotes) {
  const hits = CONCEPTS.map(c => ({ label: c.label, focus: c.focus, count: 0 }));
  for (const blob of perPlayerNotes) {
    const b = " " + blob.toLowerCase() + " ";
    hits.forEach((h, i) => { if (CONCEPTS[i].keywords.some(k => b.includes(k))) h.count++; });
  }
  return hits.filter(c => c.count >= 2).sort((a, b) => b.count - a.count);
}

function skillGuide(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("skat")) return "skating and pace";
  if (n.includes("puck")) return "puck skills";
  if (n.includes("iq") || n.includes("sense") || n.includes("aware") || n.includes("anticip")) return "hockey sense";
  if (n.includes("compete") || n.includes("effort") || n.includes("battle")) return "compete level";
  return name || "skills";
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const stdev = (xs) => { const m = mean(xs); return (m == null || xs.length < 2) ? 0 : Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length); };
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
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

  // Per-skill average per athlete — INTERNAL ONLY (to derive skill identity).
  const skillRows = await sql`
    SELECT sc.name AS skill, sc.display_order, cs.athlete_id, AVG(cs.score) AS avg_score
    FROM category_scores cs JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
    WHERE cs.age_category_id = ${catId}
    GROUP BY sc.name, sc.display_order, cs.athlete_id`;
  const skillMap = {};
  for (const r of skillRows) {
    const s = (skillMap[r.skill] ||= { name: r.skill, order: r.display_order, byAthlete: {} });
    s.byAthlete[r.athlete_id] = parseFloat(r.avg_score) / scale;
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
    if (skatersN >= 6 && shape.defense > 0) {
      const ratio = shape.forwards / shape.defense;
      if (ratio > 2.6) shapeNote = "blue-line-light — plan a structure that protects a thin back end";
      else if (ratio < 1.6) shapeNote = "deep on the blue line — you can run an active D and rotate pairings hard";
    }

    // Skill identity — ONLY when the skills genuinely separate (no noise leans).
    let strengths = [], growth = [];
    if (skills.length >= 3 && ids.length >= 4) {
      const ranked = skills
        .map(s => ({ name: s.name, avg: mean(ids.map(id => s.byAthlete[id]).filter(v => v != null)) }))
        .filter(s => s.avg != null)
        .sort((a, b) => b.avg - a.avg);
      if (ranked.length >= 3 && (ranked[0].avg - ranked[ranked.length - 1].avg) >= 0.05) {
        strengths = [...new Set(ranked.slice(0, ranked.length >= 4 ? 2 : 1).map(s => skillGuide(s.name)))];
        growth = [...new Set([skillGuide(ranked[ranked.length - 1].name)])].filter(g => !strengths.includes(g));
      }
    }

    // Within-team spread — only surface the actionable case (a clear top tier).
    let clearTopTier = false;
    const totals = ids.map(id => totalById[id]).filter(v => v != null);
    if (totals.length >= 5 && mean(totals) > 0 && stdev(totals) / mean(totals) > 0.18) clearTopTier = true;

    // Development priorities (real concepts, counted by player)
    const perPlayer = ids.map(id => (notesByAthlete[id] || []).join(" ")).filter(Boolean);
    const concepts = extractConcepts(perPlayer);
    const themes = concepts.slice(0, 6).map(c => ({ theme: c.label, count: c.count }));

    // ── Coach's read ───────────────────────────────────────────────────
    const readParts = [];
    if (concepts.length >= 2) {
      readParts.push(`The evaluation notes point to a few shared priorities for this group: ${listWords(concepts.slice(0, 3).map(c => lower(c.label)))}.`);
    } else if (concepts.length === 1) {
      readParts.push(`The evaluation notes most consistently flag ${lower(concepts[0].label)}.`);
    }
    if (strengths.length && growth.length) readParts.push(`On the ice, the group's identity leans to ${listWords(strengths)}, with ${growth[0]} the clearest area to build.`);
    else if (strengths.length) readParts.push(`On the ice, the group's identity leans to ${listWords(strengths)}.`);
    if (clearTopTier) readParts.push(`It sits as a clear top tier over a development group — keep early-season reps pulling the bottom half up.`);
    const summary = readParts.join(" ");

    // ── Takeaways (specific, actionable) ───────────────────────────────
    const takeaways = [];
    for (const c of concepts.slice(0, 3)) {
      takeaways.push(`Prioritize ${lower(c.label)} — ${c.focus}. Flagged on ${c.count} of ${ids.length} players.`);
    }
    if (growth.length) takeaways.push(`Skill-wise, ${growth[0]} is the group's clearest development area — give it dedicated early-season ice.`);
    if (shapeNote) takeaways.push(`Roster shape: you're ${shapeNote}.`);
    if (clearTopTier) takeaways.push(`There's a real gap top-to-bottom — build reps that keep the development group progressing, not just the top unit.`);

    return {
      id: t.id, name: t.name, coach_name: t.coach_name, coach_email: t.coach_email,
      rank_order: t.rank_order, is_top: topTeam && t.id === topTeam.id,
      player_count: ranking.length,
      summary, takeaways, strengths, growth, shape, shapeNote, themes, ranking,
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
