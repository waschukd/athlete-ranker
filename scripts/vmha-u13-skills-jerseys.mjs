// VMHA U13 M: wear your GAME jersey to the skills skates.
//
//   node scripts/vmha-u13-skills-jerseys.mjs            (preview)
//   node scripts/vmha-u13-skills-jerseys.mjs --commit
//
// The tournament has three teams (White, Black, Yellow) but session 1 is two
// skills groups, so each group has players from all three teams on the ice at
// once. The association wants every player in the same jersey all weekend --
// which means a two-colour session palette cannot describe the ice.
//
// checkin_sessions.team_colors has always accepted 2-6 colours; the pickers
// just had no way to add a slot (fixed separately). This sets both session-1
// groups to the three team colours and colours every player by the team they
// will actually play for, so the door hands out the right jersey and the
// evaluator's screen shows the colour they are looking at.
//
// Idempotent: re-running just re-asserts the same colours.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const CAT = 142, SESSION = 1;

// Must match PRESET_TEAM_COLORS in src/lib/teamColors.js exactly -- the UI
// matches a stored colour to a preset by name, and an unknown name renders as
// a blank grey placeholder.
const PRESET = {
  white:  { name: "White",  hex: "#ffffff", text: "#111827", border: "#9ca3af" },
  black:  { name: "Black",  hex: "#111827", text: "#ffffff", border: "#374151" },
  yellow: { name: "Yellow", hex: "#facc15", text: "#111827", border: "#a16207" },
};

const teams = await sql`SELECT id, name, display_order FROM scrimmage_teams WHERE age_category_id = ${CAT} ORDER BY display_order`;
const unknown = teams.filter(t => !PRESET[String(t.name).toLowerCase()]);
const palette = teams.map(t => PRESET[String(t.name).toLowerCase()]).filter(Boolean);

const rows = await sql`
  SELECT es.id, es.group_number g, es.start_time,
    (SELECT COUNT(*)::int FROM player_checkins p WHERE p.schedule_id = es.id) players
  FROM evaluation_schedule es
  WHERE es.age_category_id = ${CAT} AND es.session_number = ${SESSION} ORDER BY es.group_number`;

const members = await sql`
  SELECT m.athlete_id, t.name AS team, a.first_name || ' ' || a.last_name AS nm
  FROM scrimmage_team_members m
  JOIN scrimmage_teams t ON t.id = m.scrimmage_team_id
  JOIN athletes a ON a.id = m.athlete_id
  WHERE t.age_category_id = ${CAT}`;
const teamOf = new Map(members.map(m => [m.athlete_id, m.team]));

console.log(`VMHA U13 M -- session ${SESSION} jerseys follow the tournament teams\n`);
console.log(`  teams: ${teams.map(t => `${t.name} (${members.filter(m => m.team === t.name).length})`).join(", ")}`);
if (unknown.length) console.log(`  WARNING: no jersey preset matches ${unknown.map(t => t.name).join(", ")} -- rename the team to a palette colour first`);
console.log(`  palette to set on each group: ${palette.map(p => p.name).join(" / ")}`);

let missing = 0;
for (const r of rows) {
  const ids = await sql`SELECT athlete_id FROM player_checkins WHERE schedule_id = ${r.id}`;
  const counts = {};
  for (const { athlete_id } of ids) {
    const t = teamOf.get(athlete_id);
    if (!t) { missing++; continue; }
    counts[t] = (counts[t] || 0) + 1;
  }
  console.log(`\n  Group ${r.g} (${String(r.start_time).slice(0, 5)}, ${r.players} players): ${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ") || "nobody"}`);
}
if (missing) console.log(`\n  ${missing} player(s) on the ice are not on any team -- they keep whatever colour they have.`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }
if (palette.length < 2) { console.error("Refusing: fewer than two recognised team colours."); process.exit(1); }

for (const r of rows) {
  await sql`
    INSERT INTO checkin_sessions (schedule_id, age_category_id, team_colors, is_open)
    VALUES (${r.id}, ${CAT}, ${JSON.stringify(palette)}, false)
    ON CONFLICT (schedule_id) DO UPDATE SET team_colors = ${JSON.stringify(palette)}`;
  const ids = await sql`SELECT athlete_id FROM player_checkins WHERE schedule_id = ${r.id}`;
  let set = 0;
  for (const { athlete_id } of ids) {
    const t = teamOf.get(athlete_id);
    if (!t) continue;
    await sql`UPDATE player_checkins SET team_color = ${t} WHERE schedule_id = ${r.id} AND athlete_id = ${athlete_id}`;
    set++;
  }
  console.log(`Group ${r.g}: palette set to ${palette.map(p => p.name).join("/")}, ${set} players coloured by team`);
}

const after = await sql`
  SELECT es.group_number g, p.team_color, COUNT(*)::int n
  FROM player_checkins p JOIN evaluation_schedule es ON es.id = p.schedule_id
  WHERE es.age_category_id = ${CAT} AND es.session_number = ${SESSION}
  GROUP BY 1, 2 ORDER BY 1, 2`;
console.log("\nnow:");
for (const a of after) console.log(`   Group ${a.g}  ${String(a.team_color || "(none)").padEnd(7)} ${a.n}`);
console.log("\nAnyone with the check-in or scoring screen open should reload.");
process.exit(0);
