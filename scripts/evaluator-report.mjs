// Evaluator performance report for the Competitive Thread pool, using the same
// measures the app shows on an evaluator's report card:
//
//   agreement  -- tier-consensus rate (lib/scoring tierDisagreementStats): how
//                 often their score put an athlete in the same top/middle/bottom
//                 tier as the panel. >=90 good, 75-89 watch, <75 needs a word.
//   bias       -- signed points above (+) or below (-) the peer average on the
//                 same athlete/criterion. |bias| >= 0.3 is what the report-card
//                 email calls out.
//   completion -- of the athletes checked in to a session they worked, how many
//                 they actually scored. Anything under 80% on a past session is
//                 a gap in the data the association is paying for.
//   spread     -- standard deviation of their scores. Near zero means everyone
//                 got the same number, which ranks nobody.
//   notes      -- share of scored athletes with a note.
//
//   node scripts/evaluator-report.mjs             (season + last 7 days)
//   node scripts/evaluator-report.mjs --days 14
//
// Read-only. Sends nothing.
import { connect } from "./_db.mjs";
import { tierDisagreementStats } from "../src/lib/scoring.js";

const sql = connect(import.meta.url);
const CT = 16;
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const DAYS = parseInt(arg("--days") || "7");

const evaluators = await sql`
  SELECT DISTINCT u.id, u.name, u.email FROM evaluator_memberships em JOIN users u ON u.id = em.user_id
  WHERE em.organization_id = ${CT} AND em.status = 'active' AND em.is_evaluator = true
    AND COALESCE(u.is_suspended, false) = false AND u.email NOT ILIKE '%@ctdemo.%'
  ORDER BY u.name`;
const evalIds = evaluators.map(e => e.id);

const catIds = (await sql`
  SELECT c.id FROM age_categories c
  WHERE c.organization_id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id = ${CT} AND status = 'active')
     OR c.organization_id = ${CT}`).map(r => r.id);

// ── Tier agreement, roster-wide in one pass (same as service-provider/evaluators GET)
const grouped = await sql`
  SELECT cs.age_category_id, cs.session_number, sg.group_number, cs.athlete_id, cs.evaluator_id, cs.score::float AS score
  FROM category_scores cs
  JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
  JOIN session_groups sg ON sg.id = pga.session_group_id
    AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
  WHERE cs.age_category_id = ANY(${catIds})`;
const coachSet = new Set((await sql`
  SELECT age_category_id, user_id FROM category_evaluators
  WHERE age_category_id = ANY(${catIds}) AND kind = 'coach' AND user_id IS NOT NULL`).map(r => `${r.age_category_id}-${r.user_id}`));
const tiers = tierDisagreementStats(grouped, coachSet);

// ── Bias vs peers, per evaluator, one query
const biasRows = await sql`
  SELECT mine.evaluator_id,
         AVG(mine.score::float - peer.avg)::float AS bias, COUNT(*)::int AS n
  FROM category_scores mine
  JOIN LATERAL (
    SELECT AVG(p.score::float) AS avg FROM category_scores p
    WHERE p.athlete_id = mine.athlete_id AND p.scoring_category_id = mine.scoring_category_id
      AND p.session_number = mine.session_number AND p.age_category_id = mine.age_category_id
      AND p.evaluator_id <> mine.evaluator_id
  ) peer ON peer.avg IS NOT NULL
  WHERE mine.evaluator_id = ANY(${evalIds}) AND mine.age_category_id = ANY(${catIds})
  GROUP BY mine.evaluator_id`;
const bias = new Map(biasRows.map(r => [r.evaluator_id, r]));

// ── Sessions worked, completion, closes, no-shows, spread, notes
const work = await sql`
  SELECT ess.user_id,
    COUNT(*) FILTER (WHERE es.scheduled_date < CURRENT_DATE AND ess.no_show IS NOT TRUE)::int AS sessions_season,
    COUNT(*) FILTER (WHERE es.scheduled_date >= CURRENT_DATE - (${DAYS} * INTERVAL '1 day') AND es.scheduled_date < CURRENT_DATE AND ess.no_show IS NOT TRUE)::int AS sessions_week,
    COUNT(*) FILTER (WHERE ess.no_show)::int AS no_shows,
    COUNT(*) FILTER (WHERE es.scheduled_date < CURRENT_DATE AND ess.closed_at IS NOT NULL)::int AS closed,
    COUNT(*) FILTER (WHERE es.scheduled_date >= CURRENT_DATE)::int AS upcoming
  FROM evaluator_session_signups ess JOIN evaluation_schedule es ON es.id = ess.schedule_id
  JOIN age_categories c ON c.id = es.age_category_id
  LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
  JOIN organizations o ON o.id = c.organization_id
  WHERE ess.user_id = ANY(${evalIds}) AND ess.status = 'signed_up' AND es.status = 'scheduled'
    AND COALESCE(cs.session_type, 'evaluation') <> 'testing'
    -- Scheduling-only associations (Confederation) never produce scores;
    -- counting those sessions makes a scoring gap look like a person problem.
    AND COALESCE(o.auto_close_sessions, false) = false
  GROUP BY ess.user_id`;
const workMap = new Map(work.map(w => [w.user_id, w]));

// Per past session: roster size vs athletes this evaluator scored.
const completion = await sql`
  SELECT ess.user_id, es.id AS schedule_id, es.scheduled_date, c.name AS cat, o.name AS org, es.group_number,
    (SELECT COUNT(*)::int FROM player_checkins pc WHERE pc.schedule_id = es.id AND pc.checked_in) AS roster,
    (SELECT COUNT(DISTINCT cs.athlete_id)::int FROM category_scores cs
       JOIN player_checkins pc ON pc.athlete_id = cs.athlete_id AND pc.schedule_id = es.id AND pc.checked_in
       WHERE cs.evaluator_id = ess.user_id AND cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number) AS scored
  FROM evaluator_session_signups ess JOIN evaluation_schedule es ON es.id = ess.schedule_id
  JOIN age_categories c ON c.id = es.age_category_id JOIN organizations o ON o.id = c.organization_id
  LEFT JOIN category_sessions csn ON csn.age_category_id = es.age_category_id AND csn.session_number = es.session_number
  WHERE ess.user_id = ANY(${evalIds}) AND ess.status = 'signed_up' AND ess.no_show IS NOT TRUE
    AND es.status = 'scheduled' AND es.scheduled_date < CURRENT_DATE
    AND COALESCE(csn.session_type, 'evaluation') <> 'testing'
    AND COALESCE(o.auto_close_sessions, false) = false`;
const compMap = new Map();
for (const r of completion) { if (!compMap.has(r.user_id)) compMap.set(r.user_id, []); compMap.get(r.user_id).push(r); }

const spread = await sql`
  SELECT evaluator_id, STDDEV_POP(score::float)::float AS sd, COUNT(*)::int AS n, COUNT(DISTINCT athlete_id)::int AS athletes
  FROM category_scores WHERE evaluator_id = ANY(${evalIds}) AND age_category_id = ANY(${catIds}) GROUP BY evaluator_id`;
const spreadMap = new Map(spread.map(s => [s.evaluator_id, s]));
const notes = await sql`
  SELECT evaluator_id, COUNT(DISTINCT athlete_id)::int AS noted FROM player_notes
  WHERE evaluator_id = ANY(${evalIds}) AND age_category_id = ANY(${catIds}) AND COALESCE(note_text,'') <> '' GROUP BY evaluator_id`;
const notesMap = new Map(notes.map(n => [n.evaluator_id, n.noted]));
const flags = await sql`
  SELECT evaluator_id, COUNT(*)::int AS late FROM evaluator_flags WHERE evaluator_id = ANY(${evalIds}) AND flag_type = 'late_cancel' GROUP BY evaluator_id`;
const flagMap = new Map(flags.map(f => [f.evaluator_id, f.late]));

// ── Assemble
const rows = [];
for (const e of evaluators) {
  const w = workMap.get(e.id) || {};
  const t = tiers.get(e.id);
  const agreement = t && t.totalJudged > 0 ? Math.round((1 - t.timesDiffered / t.totalJudged) * 100) : null;
  const b = bias.get(e.id);
  const sp = spreadMap.get(e.id);
  const comps = compMap.get(e.id) || [];
  const weak = comps.filter(c => c.roster > 0 && c.scored / c.roster < 0.8);
  const weakWeek = weak.filter(c => new Date(c.scheduled_date) >= new Date(Date.now() - DAYS * 864e5));
  const noted = notesMap.get(e.id) || 0;
  const reasons = [];
  // The app's bands: >=90 green, 75-89 amber, <75 red. Amber is worth a word
  // once the sample is big enough that it is not noise -- 83% on 940 judged
  // is a real pattern, 61% on 23 is one session.
  if (agreement != null && (
        (t.totalJudged >= 30 && agreement < 75) ||
        (t.totalJudged >= 100 && agreement < 80) ||
        (t.totalJudged >= 300 && agreement < 85)))
    reasons.push(`agreement ${agreement}% on ${t.totalJudged} judged`);
  // Notes are what the parent report is written from. Near-zero on real volume
  // means the association gets numbers and nothing else.
  if (sp && sp.athletes >= 80 && noted / sp.athletes < 0.05) reasons.push(`notes on ${Math.round(100 * noted / sp.athletes)}% of ${sp.athletes} athletes scored`);
  // Worked sessions but produced no scores at all -- either scheduling-only
  // sessions (fine) or they are not scoring (not fine). Listed so it is looked at.
  if ((w.sessions_season || 0) >= 3 && (!sp || sp.n === 0)) reasons.push(`${w.sessions_season} sessions worked, no scores recorded`);
  if (b && b.n >= 30 && Math.abs(b.bias) >= 0.5) reasons.push(`scores ${b.bias > 0 ? "+" : ""}${b.bias.toFixed(2)} vs peers`);
  if (weakWeek.length) reasons.push(`${weakWeek.length} session${weakWeek.length > 1 ? "s" : ""} this week under 80% scored`);
  if (sp && sp.n >= 100 && sp.sd < 0.6) reasons.push(`spread ${sp.sd.toFixed(2)} -- nearly every score the same`);
  if ((w.no_shows || 0) > 0) reasons.push(`${w.no_shows} no-show`);
  if ((flagMap.get(e.id) || 0) >= 1) reasons.push(`${flagMap.get(e.id)} late cancel`);
  rows.push({ e, w, agreement, judged: t?.totalJudged || 0, bias: b?.bias ?? null, biasN: b?.n || 0, sd: sp?.sd ?? null, scored: sp?.athletes || 0,
              sessions: comps.length, weak, weakWeek, noted, reasons });
}

const active = rows.filter(r => (r.w.sessions_season || 0) > 0);
active.sort((a, b) => (a.agreement ?? 101) - (b.agreement ?? 101));

const pct = v => v == null ? "  --" : String(v).padStart(3) + "%";
const f2 = v => v == null ? "   --" : (v >= 0 ? "+" : "") + v.toFixed(2);
console.log(`Competitive Thread evaluators -- ${active.length} have worked a session (${rows.length - active.length} have not)\n`);
console.log("name                 wk/season  agree  judged   bias   spread  notes  weak-sessions");
for (const r of active) {
  const noteRate = r.scored ? Math.round(100 * r.noted / r.scored) : 0;
  console.log(
    `${r.e.name.trim().padEnd(20)} ${String(r.w.sessions_week || 0).padStart(2)}/${String(r.w.sessions_season || 0).padEnd(3)}   ` +
    `${pct(r.agreement)}  ${String(r.judged).padStart(5)}  ${f2(r.bias).padStart(6)}  ${r.sd == null ? "  --" : r.sd.toFixed(2).padStart(5)}   ${String(noteRate).padStart(3)}%   ` +
    `${r.weak.length ? r.weak.length + " of " + r.sessions : "-"}`);
}

const needs = active.filter(r => r.reasons.length);
console.log(`\nNEEDS A MESSAGE (${needs.length}):`);
for (const r of needs) {
  console.log(`  ${r.e.name.trim()} <${r.e.email}>`);
  for (const x of r.reasons) console.log(`     - ${x}`);
  for (const c of r.weakWeek.slice(0, 3)) console.log(`       ${String(c.scheduled_date).slice(0,10)} ${c.org} ${c.cat} G${c.group_number}: scored ${c.scored} of ${c.roster}`);
}
if (!needs.length) console.log("  nobody");

const watch = active.filter(r => !r.reasons.length && r.agreement != null && r.agreement < 75);
if (watch.length) {
  console.log(`
WATCH (red agreement, sample too small to act on yet):`);
  for (const r of watch) console.log(`  ${r.e.name.trim()}: ${r.agreement}% on ${r.judged} judged, ${r.w.sessions_season} session(s)`);
}

const strong = active.filter(r => r.agreement != null && r.judged >= 50 && r.agreement >= 90 && !r.reasons.length);
console.log(`\nSTRONG (agreement >= 90% on 50+ judged, nothing flagged): ${strong.map(r => r.e.name.trim()).join(", ") || "none yet"}`);
