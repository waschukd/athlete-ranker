// Repairs associations onboarded via the bulk "Set up entire association" flow,
// which wrote evaluation_schedule.group_number but never created the matching
// session_groups row — so "Manage groups" reported "No groups found. Upload a
// schedule first." even though the schedule plainly showed groups.
//
// The writer is fixed (bulk-onboard/commit now calls ensureSessionGroup); this
// backfills the rows already in the DB. Idempotent — only creates what's missing.
//
//   node scripts/backfill-session-groups.mjs            # dry run
//   node scripts/backfill-session-groups.mjs --commit   # apply
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const missing = await sql`
  SELECT DISTINCT es.age_category_id, es.session_number, es.group_number,
         ac.name AS category, o.name AS org
  FROM evaluation_schedule es
  JOIN age_categories ac ON ac.id = es.age_category_id
  JOIN organizations o ON o.id = ac.organization_id
  WHERE es.group_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM session_groups sg
      WHERE sg.age_category_id = es.age_category_id
        AND sg.session_number = es.session_number
        AND sg.group_number = es.group_number)
  ORDER BY o.name, es.age_category_id, es.session_number, es.group_number
`;

if (!missing.length) {
  console.log("Nothing to do — every scheduled group already has a session_groups row.");
  process.exit(0);
}

const byCat = new Map();
for (const m of missing) {
  const k = `${m.org} · ${m.category} (cat ${m.age_category_id})`;
  byCat.set(k, (byCat.get(k) || 0) + 1);
}
console.log(`WILL CREATE ${missing.length} session_groups rows across ${byCat.size} categories:`);
for (const [k, n] of byCat) console.log(`  ${String(n).padStart(3)}  ${k}`);

if (!COMMIT) {
  console.log("\nDRY RUN — re-run with --commit to apply.");
  process.exit(0);
}

let created = 0;
for (const m of missing) {
  // Re-check inside the loop: idempotent even if run concurrently.
  const exists = await sql`
    SELECT id FROM session_groups
    WHERE age_category_id = ${m.age_category_id}
      AND session_number = ${m.session_number}
      AND group_number = ${m.group_number}`;
  if (exists.length) continue;
  await sql`
    INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
    VALUES (${m.age_category_id}, ${m.session_number}, ${m.group_number},
            ${"Group " + m.group_number}, ${m.group_number})`;
  created++;
}

const [{ left }] = await sql`
  SELECT COUNT(*)::int AS left FROM evaluation_schedule es
  WHERE es.group_number IS NOT NULL AND es.age_category_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM session_groups sg
      WHERE sg.age_category_id = es.age_category_id
        AND sg.session_number = es.session_number
        AND sg.group_number = es.group_number)
`;
console.log(`\nDONE — created ${created} rows. Remaining unmatched: ${left}`);
