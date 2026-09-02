// Re-point every player's jersey colour at their own scrimmage team, for
// tournament categories where the two drifted apart.
//
//   node scripts/fix-team-colour-mismatch.mjs            # dry run, all orgs
//   node scripts/fix-team-colour-mismatch.mjs --commit
//   node scripts/fix-team-colour-mismatch.mjs --cat 92 --commit
//
// Cause: colours were assigned by SLOT ORDER (teamIds[0] -> palette[0]) and by
// snake position, neither of which knows the team's name. Millwoods U9 Tier 1
// had teams Blue/Grey against a palette of [Grey, Blue], so team Blue was handed
// grey chips -- on the check-in screen a "Blue" player shows a grey circle, and
// whoever hands out jerseys cannot tell which is right.
//
// Never touches a player who is already CHECKED IN: their jersey is physically
// on them, and rewriting it would contradict the room.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ci = process.argv.indexOf("--cat");
const ONLY_CAT = ci > -1 ? parseInt(process.argv[ci + 1]) : null;

const parsePalette = (raw) => {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return v.map(e => (e && typeof e === "object" ? e.name : e)).filter(Boolean).map(String);
};

const cats = ONLY_CAT
  ? await sql`SELECT id, name FROM age_categories WHERE id = ${ONLY_CAT} AND eval_format = 'round_robin'`
  : await sql`SELECT id, name FROM age_categories WHERE eval_format = 'round_robin' AND status = 'active' ORDER BY id`;

let totalFixed = 0, totalSkipped = 0;

for (const cat of cats) {
  const teams = await sql`SELECT id, name FROM scrimmage_teams WHERE age_category_id = ${cat.id} ORDER BY display_order, id`;
  if (teams.length < 2) continue;
  const members = await sql`SELECT athlete_id, scrimmage_team_id FROM scrimmage_team_members WHERE scrimmage_team_id = ANY(${teams.map(t => t.id)})`;
  if (!members.length) continue;
  const teamOfAthlete = new Map(members.map(m => [m.athlete_id, m.scrimmage_team_id]));

  const sessions = await sql`
    SELECT cs.id, cs.schedule_id, cs.team_colors, es.scheduled_date, es.session_number
    FROM checkin_sessions cs JOIN evaluation_schedule es ON es.id = cs.schedule_id
    WHERE cs.age_category_id = ${cat.id} AND es.scheduled_date >= CURRENT_DATE
    ORDER BY es.scheduled_date`;

  for (const s of sessions) {
    const palette = parsePalette(s.team_colors);
    if (palette.length < 2) continue;

    // Same rule as the code: name match first, then next free colour.
    const taken = new Set();
    const colourOfTeam = new Map();
    for (const t of teams) {
      const nm = String(t.name || "").trim().toLowerCase();
      const hit = palette.find(c => c.toLowerCase() === nm && !taken.has(c.toLowerCase()));
      if (hit) { colourOfTeam.set(t.id, hit); taken.add(hit.toLowerCase()); }
    }
    for (const t of teams) {
      if (colourOfTeam.has(t.id)) continue;
      const free = palette.find(c => !taken.has(c.toLowerCase()));
      if (free) { colourOfTeam.set(t.id, free); taken.add(free.toLowerCase()); }
    }

    const rows = await sql`
      SELECT pc.athlete_id, pc.team_color, pc.checked_in, a.first_name, a.last_name
      FROM player_checkins pc JOIN athletes a ON a.id = pc.athlete_id
      WHERE pc.schedule_id = ${s.schedule_id}`;

    const wrong = rows.filter(r => {
      const want = colourOfTeam.get(teamOfAthlete.get(r.athlete_id));
      return want && String(r.team_color || "").toLowerCase() !== want.toLowerCase();
    });
    if (!wrong.length) continue;

    // Skip the whole session once ANYONE has checked in. Those jerseys are
    // physically on kids, so correcting only the players still to arrive would
    // leave the room split across two schemes -- worse than the mismatch. A
    // session already underway is the door volunteer's to sort out, not ours.
    const anyCheckedIn = rows.some(r => r.checked_in);
    if (anyCheckedIn) {
      console.log(`\n${cat.name} · session ${s.session_number} (schedule ${s.schedule_id}) — SKIPPED, already in progress (${rows.filter(r => r.checked_in).length} checked in, ${wrong.length} mismatched)`);
      totalSkipped += wrong.length;
      continue;
    }

    const checkedIn = [];
    const fixable = wrong;
    console.log(`\n${cat.name} · session ${s.session_number} (schedule ${s.schedule_id}) — palette [${palette.join(", ")}]`);
    console.log(`  ${wrong.length} mismatched; ${fixable.length} fixable, ${checkedIn.length} already checked in (left alone)`);
    for (const r of fixable.slice(0, 5)) {
      const want = colourOfTeam.get(teamOfAthlete.get(r.athlete_id));
      console.log(`    ${r.last_name}, ${r.first_name}: ${r.team_color} -> ${want}`);
    }
    if (fixable.length > 5) console.log(`    … +${fixable.length - 5} more`);
    totalSkipped += checkedIn.length;

    if (COMMIT) {
      for (const r of fixable) {
        const want = colourOfTeam.get(teamOfAthlete.get(r.athlete_id));
        await sql`
          UPDATE player_checkins SET team_color = ${want}
          WHERE schedule_id = ${s.schedule_id} AND athlete_id = ${r.athlete_id} AND checked_in IS NOT TRUE`;
        totalFixed++;
      }
    } else {
      totalFixed += fixable.length;
    }
  }
}

console.log(COMMIT
  ? `\nfixed ${totalFixed}; left ${totalSkipped} already-checked-in players alone`
  : `\nDRY RUN — would fix ${totalFixed}, leaving ${totalSkipped} already checked in. Re-run with --commit.`);
