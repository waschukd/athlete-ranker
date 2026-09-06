// Every athlete who has an overall testing RANK but is missing drill values.
//
// The upload route fired one Promise.all over every test value in the file
// (125 athletes x 10 drills = 1,250 statements). Past a few hundred the batch
// threw, and a catch swallowed it -- so ranks all landed, roughly the first
// thousand test values landed, and the upload still reported success. The
// damage is invisible in the rankings and only shows as dashes in the report.
//
//   node scripts/audit-testing-gaps.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

// Per (category, session): how many athletes hold a rank, how many hold any
// test value, and the usual drill count -- an athlete well under it was cut off
// mid-write.
const rows = await sql`
  SELECT d.age_category_id AS cat, d.session_number AS sess,
         c.name AS cat_name, o.name AS org,
         COUNT(*)::int AS ranked,
         COUNT(*) FILTER (WHERE t.n > 0)::int AS with_tests,
         MAX(COALESCE(t.n,0))::int AS max_drills
  FROM testing_drill_results d
  JOIN age_categories c ON c.id = d.age_category_id
  JOIN organizations o ON o.id = c.organization_id
  LEFT JOIN (
    SELECT athlete_id, age_category_id, session_number, COUNT(*)::int AS n
    FROM testing_results GROUP BY 1,2,3
  ) t ON t.athlete_id = d.athlete_id AND t.age_category_id = d.age_category_id
     AND t.session_number = d.session_number
  GROUP BY 1,2,3,4 ORDER BY o.name, c.name, d.session_number`;

let bad = 0;
console.log("org / division / session        ranked  with values  missing");
console.log("-".repeat(72));
for (const r of rows) {
  const missing = r.ranked - r.with_tests;
  const flag = missing > 0 ? "  <-- GAP" : "";
  if (missing > 0) bad++;
  // A division that never uploaded drill values at all (max_drills = 0) is not
  // a truncation, it just used ranks only -- call that out separately.
  const kind = r.max_drills === 0 ? "  (ranks only, no drills uploaded)" : flag;
  console.log(
    `${(r.org + " / " + r.cat_name).slice(0, 40).padEnd(42)}s${r.sess}  ` +
    `${String(r.ranked).padStart(5)}  ${String(r.with_tests).padStart(10)}  ${String(missing).padStart(7)}${kind}`);
}
console.log(`\n${bad} category/session combinations have athletes missing drill values.`);

// Also: athletes with SOME but not the full set -- the row that was mid-write.
const partial = await sql`
  SELECT c.name AS cat_name, o.name AS org, t.session_number AS sess,
         a.first_name, a.last_name, t.n
  FROM (SELECT athlete_id, age_category_id, session_number, COUNT(*)::int AS n
        FROM testing_results GROUP BY 1,2,3) t
  JOIN athletes a ON a.id = t.athlete_id
  JOIN age_categories c ON c.id = t.age_category_id
  JOIN organizations o ON o.id = c.organization_id
  WHERE t.n < (SELECT MAX(x.n) FROM (SELECT COUNT(*)::int AS n FROM testing_results r
               WHERE r.age_category_id = t.age_category_id AND r.session_number = t.session_number
               GROUP BY r.athlete_id) x)
  ORDER BY o.name, c.name, t.n`;
if (partial.length) {
  console.log(`\nPartially written athletes (have some drills, not the full set):`);
  for (const p of partial) console.log(`  ${p.org} / ${p.cat_name} s${p.sess}: ${p.first_name} ${p.last_name} — ${p.n} drills`);
} else {
  console.log("\nNo partially-written athletes.");
}
