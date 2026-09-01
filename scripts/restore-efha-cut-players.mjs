// EFHA (org 49) U13/U15/U18 AA (categories 113/114/115): directors made cuts
// this weekend (cut_at stamped Aug 28-29), then hard-"deleted" the cut
// players from the roster to keep them off a welcome-email blast that has
// since been fixed to exclude cut_at players (see notify-parents/route.js).
// The roster "Delete" button is a soft delete (is_active = false) -- scores
// in category_scores were never touched -- so this just flips is_active
// back to true for exactly the 49 players cut+deleted this weekend,
// restoring their visibility/scores. Deliberately scoped to cut_at IS NOT
// NULL so the handful of unrelated is_active=false rows from Aug 22
// (predating this incident) are untouched.
//
// Ran --commit on 2026-08-31: 6 restored in cat 113, 28 in cat 114, 15 in
// cat 115 (49 total). Kept here as the record of what was applied; a re-run
// now finds 0 remaining in all three categories.
//
//   node scripts/restore-efha-cut-players.mjs            # dry run
//   node scripts/restore-efha-cut-players.mjs --commit   # apply

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const AA_CATS = [113, 114, 115];

for (const catId of AA_CATS) {
  const rows = await sql`
    SELECT id, first_name, last_name, cut_at
    FROM athletes
    WHERE age_category_id = ${catId} AND is_active = false AND cut_at IS NOT NULL AND cut_at >= '2026-08-28'
    ORDER BY last_name, first_name
  `;
  console.log(`\ncategory ${catId}: ${rows.length} player(s) to restore`);
  for (const r of rows) {
    console.log(`  ${COMMIT ? "RESTORE " : "would restore "}${r.first_name} ${r.last_name} (id ${r.id})`);
    if (COMMIT) {
      await sql`UPDATE athletes SET is_active = true WHERE id = ${r.id}`;
    }
  }
}

console.log(`\n${COMMIT ? "APPLIED" : "DRY RUN"}. Re-run with --commit to apply.`);
