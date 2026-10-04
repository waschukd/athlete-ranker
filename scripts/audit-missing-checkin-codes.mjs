// Any scheduled session with no check-in code cannot be opened at the door --
// the code is the only way in, and it is only noticed when people are standing
// at the rink. VMHA U13 game 3 reached its start time that way.
//
//   node scripts/audit-missing-checkin-codes.mjs            (report)
//   node scripts/audit-missing-checkin-codes.mjs --fix      (generate the missing ones)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const FIX = process.argv.includes("--fix");

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function uniqueCode(sn, g) {
  for (;;) {
    let suffix = "";
    for (let i = 0; i < 6; i++) suffix += CHARS[randomInt(0, CHARS.length)];
    const code = `S${sn}G${g || 0}-${suffix}`;
    const dup = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
    if (!dup.length) return code;
  }
}

const rows = await sql`
  SELECT es.id, es.session_number sn, es.group_number g, es.scheduled_date::text d, es.start_time,
    c.name cat, o.name org, es.status
  FROM evaluation_schedule es
  LEFT JOIN age_categories c ON c.id = es.age_category_id
  LEFT JOIN organizations o ON o.id = c.organization_id
  WHERE es.checkin_code IS NULL AND es.status <> 'cancelled' AND es.scheduled_date >= CURRENT_DATE - 1
  ORDER BY es.scheduled_date, es.start_time`;

console.log(`sessions with no check-in code (today onward): ${rows.length}\n`);
for (const r of rows) console.log(`  id ${r.id}  ${(r.org || "?") + " / " + (r.cat || "?")}  S${r.sn} G${r.g}  ${r.d} ${String(r.start_time).slice(0, 5)}`);
if (!rows.length) { console.log("  none -- every upcoming session can be opened."); process.exit(0); }

if (!FIX) { console.log("\nRe-run with --fix to generate codes for these."); process.exit(0); }
for (const r of rows) {
  const code = await uniqueCode(r.sn, r.g);
  await sql`UPDATE evaluation_schedule SET checkin_code = ${code}, checkin_code_active = true, updated_at = NOW() WHERE id = ${r.id} AND checkin_code IS NULL`;
  console.log(`id ${r.id} -> ${code}`);
}
process.exit(0);
