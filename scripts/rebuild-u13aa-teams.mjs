// U13 AA (category 113) ONLY: rebuild 3 teams -> 2, using only the players who
// survived cuts, for games 7 and 8 (schedules 699 and 700).
//
//   node scripts/rebuild-u13aa-teams.mjs            # dry run
//   node scripts/rebuild-u13aa-teams.mjs --commit   # apply
//
// Hard-scoped to category 113. U15 AA (114) and U18 AA (115) skate tonight and
// must not be touched -- the script refuses to run against anything else.
//
// Mirrors seedTeams() exactly: only is_active AND cut_at IS NULL AND non-goalie
// players are placed, defense distributed first, then forwards, snaked across
// the teams so counts stay even. Scores are never touched -- category_scores is
// keyed to athlete + session and has no team column.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const CAT = 113;
const WANT = 2;
const NAMES = ["White", "Blue"]; // matches the stored matchups on 699/700
const GAMES = [699, 700];

const [cat] = await sql`SELECT id, name, organization_id, eval_format FROM age_categories WHERE id = ${CAT}`;
if (!cat || !/U13/.test(cat.name)) { console.error(`Refusing: category ${CAT} is not U13 AA`); process.exit(1); }
console.log(`category   ${cat.id} — ${cat.name} (${cat.eval_format})`);

// Any check-in on a game freezes it; assignMatchupRoster would skip it. Surface
// that rather than silently producing a roster that never gets applied.
for (const g of GAMES) {
  const [row] = await sql`SELECT id, scheduled_date, start_time, status, matchup FROM evaluation_schedule WHERE id=${g}`;
  const [ci] = await sql`SELECT COUNT(*) FILTER (WHERE checked_in)::int AS checked_in FROM player_checkins WHERE schedule_id=${g}`;
  console.log(`game ${g}    ${row.scheduled_date.toISOString().split("T")[0]} ${row.start_time} ${row.status} · "${row.matchup}" · ${ci.checked_in} checked in${ci.checked_in ? "  *** FROZEN — Apply to schedule will skip it ***" : ""}`);
}

const teamsBefore = await sql`
  SELECT st.id, st.name, st.display_order, COUNT(m.athlete_id)::int AS members
  FROM scrimmage_teams st LEFT JOIN scrimmage_team_members m ON m.scrimmage_team_id = st.id
  WHERE st.age_category_id=${CAT} GROUP BY st.id, st.name, st.display_order ORDER BY st.display_order, st.id`;
console.log(`\nteams now  ${teamsBefore.length}`);
for (const t of teamsBefore) console.log(`  ${String(t.id).padEnd(5)} ${t.name.padEnd(10)} ${t.members} members`);

// Exactly seedTeams()' eligibility filter.
const athletes = await sql`
  SELECT id, first_name, last_name, jersey_number, position FROM athletes
  WHERE age_category_id = ${CAT} AND is_active = true AND cut_at IS NULL AND COALESCE(position,'') <> 'goalie'
  ORDER BY last_name, first_name`;
console.log(`\neligible   ${athletes.length} players (cut and inactive excluded)`);

const isD = (a) => { const p = (a.position || "").toLowerCase(); return p.startsWith("d") || p === "forward_defense"; };
const ranked = [...athletes.filter(isD), ...athletes.filter(a => !isD(a))];
console.log(`           ${athletes.filter(isD).length} D, ${athletes.filter(a => !isD(a)).length} F/other`);

// Preview the snake exactly as seedTeams would produce it.
const preview = [[], []];
for (let i = 0; i < ranked.length; i++) {
  const round = Math.floor(i / WANT), pos = i % WANT;
  preview[round % 2 === 0 ? pos : WANT - 1 - pos].push(ranked[i]);
}
console.log("");
NAMES.forEach((n, i) => console.log(`  ${n.padEnd(6)} ${preview[i].length} players`));

if (!COMMIT) {
  NAMES.forEach((n, i) => {
    console.log(`\n--- ${n} (${preview[i].length}) ---`);
    for (const a of preview[i]) console.log(`   ${a.last_name}, ${a.first_name}${isD(a) ? "  (D)" : ""}`);
  });
  console.log("\nDRY RUN — re-run with --commit to apply.");
  process.exit(0);
}

// 1) Shrink to WANT teams, dropping the highest display_order first (keeps the
//    two earliest teams, same as setTeamCount).
let live = [...teamsBefore];
while (live.length > WANT) {
  const drop = live[live.length - 1];
  await sql`DELETE FROM scrimmage_team_members WHERE scrimmage_team_id = ${drop.id}`;
  await sql`DELETE FROM scrimmage_teams WHERE id = ${drop.id} AND age_category_id = ${CAT}`;
  console.log(`dropped team ${drop.id} (${drop.name})`);
  live = live.slice(0, -1);
}

// 2) Rename the survivors so the stored "White vs Blue" matchups resolve.
for (let i = 0; i < live.length; i++) {
  await sql`UPDATE scrimmage_teams SET name = ${NAMES[i]}, display_order = ${i} WHERE id = ${live[i].id} AND age_category_id = ${CAT}`;
  console.log(`renamed team ${live[i].id}: ${live[i].name} -> ${NAMES[i]}`);
}

// 3) Reseed everyone eligible across the two teams.
const teamIds = (await sql`SELECT id FROM scrimmage_teams WHERE age_category_id=${CAT} ORDER BY display_order, id`).map(t => t.id);
await sql`DELETE FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teamIds})`;
for (let i = 0; i < ranked.length; i++) {
  const round = Math.floor(i / WANT), pos = i % WANT;
  const idx = round % 2 === 0 ? pos : WANT - 1 - pos;
  await sql`INSERT INTO scrimmage_team_members (scrimmage_team_id, athlete_id) VALUES (${teamIds[idx]}, ${ranked[i].id}) ON CONFLICT DO NOTHING`;
}

const after = await sql`
  SELECT st.id, st.name, COUNT(m.athlete_id)::int AS members,
         COUNT(m.athlete_id) FILTER (WHERE a.cut_at IS NOT NULL)::int AS cut_players
  FROM scrimmage_teams st
  LEFT JOIN scrimmage_team_members m ON m.scrimmage_team_id = st.id
  LEFT JOIN athletes a ON a.id = m.athlete_id
  WHERE st.age_category_id=${CAT} GROUP BY st.id, st.name ORDER BY st.display_order`;
console.log("\nafter:");
for (const t of after) console.log(`  ${t.name.padEnd(6)} ${t.members} members${t.cut_players ? `  *** ${t.cut_players} CUT ***` : ""}`);
console.log(`\nNext: open the Teams tab for ${cat.name} and click "Apply to schedule" so games ${GAMES.join(" and ")} pick up these rosters.`);
