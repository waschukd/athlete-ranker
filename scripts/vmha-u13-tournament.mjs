// VMHA U13 M (cat 142) runs as a tournament: three teams, three games, with a
// skills skate first that is split into two groups.
//
//   node scripts/vmha-u13-tournament.mjs            (preview)
//   node scripts/vmha-u13-tournament.mjs --commit
//
// What this sets:
//   eval_format      standard -> round_robin (unlocks Teams, matchups, and the
//                    evaluator-correction ranking math round robins need,
//                    because a different panel sees each game)
//   session 1        typed 'skills', not 'scrimmage' -- it is the Saturday
//                    morning skills skate, not a game. That type is what keeps
//                    Manage Groups showing the ordinary two-group editor for
//                    session 1 while sessions 2-4 show the matchup picker, so
//                    the association picks who skates in each skills group.
//   session groups   S1 G1 and S1 G2 created empty, ready to fill.
//   teams            Team A / B / C, empty -- seed or drag in the Teams tab.
//   matchups         S2 A vs B, S3 B vs C, S4 A vs C (full round robin, each
//                    team plays two games, each pair meets once). Editable per
//                    game in Manage Groups; rosters resolve from the teams.
//
// Weights stay 25% per session. Nothing here touches athletes or scores (there
// are none yet).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const CAT = 142;

const [cat] = await sql`SELECT id, name, eval_format, scoring_scale FROM age_categories WHERE id = ${CAT}`;
const sessions = await sql`SELECT session_number sn, name, session_type, weight_percentage w FROM category_sessions WHERE age_category_id = ${CAT} ORDER BY session_number`;
const sched = await sql`SELECT id, session_number sn, group_number g, scheduled_date::text d, start_time, matchup FROM evaluation_schedule WHERE age_category_id = ${CAT} ORDER BY scheduled_date, start_time`;
const teams = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${CAT} ORDER BY display_order`;
const groups = await sql`SELECT id, session_number sn, group_number g FROM session_groups WHERE age_category_id = ${CAT} ORDER BY session_number, group_number`;
const [{ n: athletes }] = await sql`SELECT COUNT(*)::int n FROM athletes WHERE age_category_id = ${CAT}`;

console.log(`VMHA ${cat.name} (cat ${CAT})\n`);
console.log(`  format    ${cat.eval_format} -> round_robin`);
console.log(`  session 1 ${sessions.find(s => s.sn === 1)?.session_type} -> skills   (two groups, association picks who is in each)`);
for (const s of sessions) console.log(`     S${s.sn}  ${s.session_type.padEnd(10)} ${s.w}%`);
console.log(`\n  schedule:`);
for (const r of sched) console.log(`     S${r.sn}${r.g > 1 ? ` G${r.g}` : "   "}  ${r.d} ${String(r.start_time).slice(0,5)}  ${r.matchup || "(no matchup)"}`);
console.log(`\n  teams now: ${teams.length ? teams.map(t => t.name).join(", ") : "none"} -> Team A, Team B, Team C`);
console.log(`  session groups now: ${groups.length ? groups.map(g => `S${g.sn}G${g.g}`).join(" ") : "none"} -> S1G1, S1G2 added`);
console.log(`  athletes loaded: ${athletes}${athletes === 0 ? "   <-- rosters still needed before Saturday" : ""}`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

await sql`UPDATE age_categories SET eval_format = 'round_robin' WHERE id = ${CAT}`;
console.log("format -> round_robin");

await sql`UPDATE category_sessions SET session_type = 'skills', name = 'Skills Skate' WHERE age_category_id = ${CAT} AND session_number = 1`;
for (const sn of [2, 3, 4]) await sql`UPDATE category_sessions SET session_type = 'scrimmage' WHERE age_category_id = ${CAT} AND session_number = ${sn}`;
console.log("session 1 -> skills, sessions 2-4 -> scrimmage");

// Skills groups, empty and ready for the director to fill.
for (const g of [1, 2]) {
  await sql`
    INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
    SELECT ${CAT}, 1, ${g}, ${"Group " + g}, ${g}
    WHERE NOT EXISTS (SELECT 1 FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1 AND group_number = ${g})`;
}
console.log("skills groups S1 G1 + G2 ready");

// Three teams, kept if they already exist so nobody's drag-and-drop is lost.
const want = ["Team A", "Team B", "Team C"];
for (let i = 0; i < want.length; i++) {
  await sql`
    INSERT INTO scrimmage_teams (age_category_id, name, display_order)
    SELECT ${CAT}, ${want[i]}, ${i}
    WHERE NOT EXISTS (SELECT 1 FROM scrimmage_teams WHERE age_category_id = ${CAT} AND display_order = ${i})`;
}
const live = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${CAT} ORDER BY display_order`;
console.log(`teams: ${live.map(t => t.name).join(", ")}`);

// Round robin over three teams: each pair meets once.
const byOrder = new Map(live.map(t => [t.display_order, t.name]));
const MATCHUPS = { 2: [0, 1], 3: [1, 2], 4: [0, 2] };
for (const [sn, [a, b]] of Object.entries(MATCHUPS)) {
  const label = `${byOrder.get(a)} vs ${byOrder.get(b)}`;
  const res = await sql`UPDATE evaluation_schedule SET matchup = ${label}, updated_at = NOW()
    WHERE age_category_id = ${CAT} AND session_number = ${Number(sn)} AND group_number = 1 AND matchup IS NULL RETURNING id`;
  console.log(`S${sn}: ${label}${res.length ? "" : "  (left as already set)"}`);
}
console.log("\ndone. Teams are empty -- seed them in the Teams tab once rosters are uploaded.");
process.exit(0);
