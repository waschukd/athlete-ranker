// Remove check-in rows filed against a group the player is not assigned to.
//
//   node scripts/cleanup-stray-checkins.mjs            # dry run, all categories
//   node scripts/cleanup-stray-checkins.mjs --commit
//   node scripts/cleanup-stray-checkins.mjs --cat 73 --commit
//
// Cause: applySnakeDraftColors did
//   scheduleByGroup[group.group_number] || scheduleByGroup[1]
// so when a group's schedule row could not be resolved, EVERY player in that
// group was filed against group 1's schedule instead of being skipped.
//
// Only ever deletes a row that is NOT checked in. A checked-in row is a record
// that a child physically appeared, and which of two is real is a human
// decision -- those are listed and left alone.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ci = process.argv.indexOf("--cat");
const CAT = ci > -1 ? parseInt(process.argv[ci + 1]) : null;

// A row is stray when the athlete has group assignments for that session but
// none for THIS group. If a session has no assignments at all, every row is
// legitimate (the check-in page falls back to the whole roster).
const strays = await sql`
  SELECT pc.id, o.name AS org, ac.name AS category, ac.id AS cat_id,
         es.session_number, es.group_number, a.first_name, a.last_name, pc.checked_in
  FROM player_checkins pc
  JOIN evaluation_schedule es ON es.id = pc.schedule_id
  JOIN age_categories ac ON ac.id = es.age_category_id
  JOIN organizations o ON o.id = ac.organization_id
  JOIN athletes a ON a.id = pc.athlete_id
  WHERE (${CAT}::int IS NULL OR ac.id = ${CAT})
    AND EXISTS (
      SELECT 1 FROM player_group_assignments pga JOIN session_groups sg ON sg.id = pga.session_group_id
      WHERE pga.athlete_id = pc.athlete_id AND sg.age_category_id = ac.id AND sg.session_number = es.session_number)
    AND NOT EXISTS (
      SELECT 1 FROM player_group_assignments pga JOIN session_groups sg ON sg.id = pga.session_group_id
      WHERE pga.athlete_id = pc.athlete_id AND sg.age_category_id = ac.id
        AND sg.session_number = es.session_number AND sg.group_number = es.group_number)
  ORDER BY o.name, ac.name, es.session_number, a.last_name`;

const safe = strays.filter(s => !s.checked_in);
const risky = strays.filter(s => s.checked_in);

const byCat = new Map();
for (const s of safe) {
  const k = `${s.org} · ${s.category}`;
  byCat.set(k, (byCat.get(k) || 0) + 1);
}
console.log("stray check-in rows (player not assigned to that group), NOT checked in:\n");
for (const [k, n] of [...byCat].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log(`\n  total safe to delete: ${safe.length}`);

console.log(`\nCHECKED IN on a group they are not assigned to — left alone, needs a human: ${risky.length}`);
for (const r of risky) console.log(`  ${r.org} · ${r.category} S${r.session_number}G${r.group_number}: ${r.last_name}, ${r.first_name}`);

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit to delete the safe rows."); process.exit(0); }
let n = 0;
for (const s of safe) { await sql`DELETE FROM player_checkins WHERE id = ${s.id} AND checked_in IS NOT TRUE`; n++; }
console.log(`\ndeleted ${n} stray rows; left ${risky.length} checked-in rows alone.`);
