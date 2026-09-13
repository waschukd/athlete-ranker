// Recentre one session's scores per GROUP so each group's mean matches the
// same athletes' mean from a reference session.
//
//   node scripts/recentre-session-groups.mjs --cat 95 --session 3 --ref 2            (preview)
//   node scripts/recentre-session-groups.mjs --cat 95 --session 3 --ref 2 --commit
//
// EFHA U11 Community, session 3: a new panel with no overlap from session 2
// scored Group 2 at 3.8 against a 5-7 band; the same 23 kids had been 5.1 the
// day before. Group 1 dropped 0.45, Group 3 0.46. The ranking math is
// absolute (avg / scale), so a whole group scored low by one panel sinks in
// the overall standings relative to the other groups -- a panel change, not a
// performance change.
//
// This is a flat shift within each group. Every athlete in the group moves by
// the same amount, so nobody's order inside the group changes, and each
// evaluator's internal ordering is untouched. Only athletes who played in
// BOTH sessions define the shift; athletes new to the session get the same
// shift as their group (they have no reference of their own).
//
// Every changed score is written to audit_log with the original, so it can be
// reversed. Refuses a session that is locked or has scores from a coach panel.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const CAT = parseInt(arg("--cat")), SN = parseInt(arg("--session")), REF = parseInt(arg("--ref"));
if (!CAT || !SN || !REF) { console.error("Usage: --cat <id> --session <n> --ref <n> [--groups 1,2,3] [--commit]"); process.exit(1); }
// Optionally limit to some groups -- a group that moved a tenth or two is
// noise and is better left exactly as scored.
const ONLY = arg("--groups") ? new Set(arg("--groups").split(",").map(Number)) : null;

const [cat] = await sql`SELECT c.name, o.name AS org, c.scoring_scale, c.scoring_increment FROM age_categories c JOIN organizations o ON o.id=c.organization_id WHERE c.id=${CAT}`;
const scale = parseFloat(cat.scoring_scale || 10), inc = parseFloat(cat.scoring_increment || 0.5);
console.log(`${cat.org} / ${cat.name} -- session ${SN} recentred to session ${REF}, per group\n`);

// Athlete's average across evaluators, per session, with their group that session.
const perAthlete = async (sn) => sql`
  SELECT cs.athlete_id, sg.group_number AS gn, AVG(cs.score::float) AS avg
  FROM category_scores cs
  JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
  JOIN session_groups sg ON sg.id = pga.session_group_id AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
  WHERE cs.age_category_id = ${CAT} AND cs.session_number = ${sn}
    AND cs.evaluator_id NOT IN (SELECT user_id FROM category_evaluators WHERE age_category_id = ${CAT} AND kind = 'coach' AND user_id IS NOT NULL)
  GROUP BY cs.athlete_id, sg.group_number`;
const cur = await perAthlete(SN), ref = await perAthlete(REF);
const refMap = new Map(ref.map(r => [r.athlete_id, r]));

// Shift per group = mean(ref avg) - mean(cur avg) over athletes in both.
const groups = [...new Set(cur.map(r => r.gn))].sort((a, b) => a - b);
const shift = new Map();
console.log("group   kids in both   was (ref)   now      shift");
for (const gn of groups) {
  const both = cur.filter(r => r.gn === gn && refMap.has(r.athlete_id));
  if (both.length < 5) { console.log(`  G${gn}   ${String(both.length).padStart(3)}            too few in both sessions -- no shift`); shift.set(gn, 0); continue; }
  const now = both.reduce((s, r) => s + +r.avg, 0) / both.length;
  const was = both.reduce((s, r) => s + +refMap.get(r.athlete_id).avg, 0) / both.length;
  const d = ONLY && !ONLY.has(gn) ? 0 : Math.round((was - now) * 100) / 100;
  shift.set(gn, d);
  console.log(`  G${gn}   ${String(both.length).padStart(3)}            ${was.toFixed(2)}        ${now.toFixed(2)}     ${d >= 0 ? "+" : ""}${d.toFixed(2)}${ONLY && !ONLY.has(gn) ? "   (excluded, left as scored)" : ""}`);
}

const [lock] = await sql`SELECT groups_locked_at FROM category_sessions WHERE age_category_id=${CAT} AND session_number=${SN}`;
console.log(`\nsession ${SN} groups locked: ${lock?.groups_locked_at ? "yes" : "no"}`);

// Per-score preview: every row that would change.
const rows = await sql`
  SELECT cs.id, cs.athlete_id, cs.evaluator_id, cs.score::float AS score, sg.group_number AS gn
  FROM category_scores cs
  JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
  JOIN session_groups sg ON sg.id = pga.session_group_id AND sg.age_category_id = cs.age_category_id AND sg.session_number = cs.session_number
  WHERE cs.age_category_id = ${CAT} AND cs.session_number = ${SN}`;
const snap = (v) => Math.max(0, Math.min(scale, Math.round(v / inc) * inc));
const changes = rows.map(r => ({ ...r, next: snap(r.score + (shift.get(r.gn) || 0)) })).filter(r => r.next !== r.score);
console.log(`scores that would change: ${changes.length} of ${rows.length}`);

// Athlete-level before/after for the eye test.
const names = new Map((await sql`SELECT id, first_name || ' ' || last_name AS n FROM athletes WHERE age_category_id=${CAT}`).map(a => [a.id, a.n]));
console.log(`\nATHLETE AVERAGES, session ${SN}:  ref(${REF})  ->  now  ->  after`);
for (const gn of groups) {
  console.log(`\n  Group ${gn}  (shift ${(shift.get(gn) >= 0 ? "+" : "") + shift.get(gn).toFixed(2)})`);
  const list = cur.filter(r => r.gn === gn).sort((a, b) => +b.avg - +a.avg);
  for (const r of list) {
    const after = +r.avg + shift.get(gn);
    const refv = refMap.get(r.athlete_id)?.avg;
    console.log(`     ${(names.get(r.athlete_id) || r.athlete_id).padEnd(26)} ${refv != null ? (+refv).toFixed(2) : "  -- "}   ->  ${(+r.avg).toFixed(2)}  ->  ${after.toFixed(2)}`);
  }
}

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }
if (lock?.groups_locked_at) { console.error("Refusing: session groups are locked."); process.exit(1); }

const [dan] = await sql`SELECT id FROM users WHERE email='dan@competitivethread.com'`;
for (const c of changes) {
  await sql`UPDATE category_scores SET score = ${c.next}, updated_at = NOW() WHERE id = ${c.id}`;
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
    VALUES (${dan.id}, 'score_recentre', 'athlete', ${c.athlete_id}, 'score', ${String(c.score)}, ${String(c.next)},
      ${JSON.stringify({ evaluator_id: c.evaluator_id, session_number: SN, group_number: c.gn, shift: shift.get(c.gn), reference_session: REF, score_id: c.id })}, ${CAT})`;
}
console.log(`\napplied: ${changes.length} scores shifted, each logged with its original.`);
