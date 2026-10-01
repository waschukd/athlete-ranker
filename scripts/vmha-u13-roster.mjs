// VMHA U13 M skills-skate roster, as the association sent it.
//
//   node scripts/vmha-u13-roster.mjs            (preview)
//   node scripts/vmha-u13-roster.mjs --commit
//
// Creates the 37 U13 M athletes and puts them in their session-1 skills group
// (19 in the 10:00 group, 18 in the 11:15 group). Names arrived in all caps,
// so they are title-cased for anything parent- or evaluator-facing, keeping
// the real shapes: D'Andrea, De Nevers, McCulley.
//
// Session 1 only. The three TEAMS for the round robin are a separate split and
// stay empty until the association drafts them in the Teams tab.
//
// Also types session 1 as a skills skate for U11 F and U11 M, which run the
// same way (skills Saturday morning, games after) but were still typed
// 'scrimmage' from the template.
//
// Safe to re-run: athletes are matched on first+last name within the category,
// so nobody is duplicated and group membership is just re-asserted.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const CAT = 142, ORG = 70;

const GROUP_1 = `GRIFFIN BETZ, DAX BOWMAN, COHEN BOWTELL, LIAM CAMPAGNOLA, WESTON D'ANDREA,
BENNETT DE NEVERS, BLAKE EYBEN, JORDAN FALSETTI, HAYES GIBSON, RHETT HOPALUK,
KESSLER JAMES, OLIVER KING, TANNER LYSONS, CASHEL MAUGHAN, DECLAN MAUGHAN,
ERIC MCCULLEY, BENJAMIN MEWIS, KALLUM NOBLE, LANDON NORTHWAY`;
const GROUP_2 = `EMMITT BOULAY, NOLAN FADDEN, JACE FARKASH, JET NAFZIGER, PATRICK RICHARDS,
HUDSON SCHMIDT, ZACK SMITH, KYPTON STOLZ, PEARSON STUPARYK, CHETT TAYLOR,
DOMINIC THOMPSON, THEO VISSER, BENTLY WARREN, DASH WIGHT, KYLER WIGHT,
MADDEN WILSON, FINN ZACHARIAS, GAVIN ZAHARKO`;

// Title-case that survives the shapes a hockey roster actually contains:
// an apostrophe (D'Andrea), a lowercase particle that is still capitalised in
// a surname (De Nevers), and Mc/Mac (McCulley).
const titleCase = (w) => {
  const base = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const apos = base.replace(/'(\w)/g, (_, c) => "'" + c.toUpperCase());
  return apos.replace(/^(Mc|Mac)(\w)/, (_, p, c) => p + c.toUpperCase());
};
const parse = (block) => block.split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean).map(full => {
  const parts = full.split(" ");
  return { first: titleCase(parts[0]), last: parts.slice(1).map(titleCase).join(" ") };
});

const g1 = parse(GROUP_1), g2 = parse(GROUP_2);
console.log(`VMHA U13 M -- skills skate roster\n`);
console.log(`Group 1 (10:00-11:00): ${g1.length}`);
for (const p of g1) console.log(`   ${p.first} ${p.last}`);
console.log(`\nGroup 2 (11:15-12:15): ${g2.length}`);
for (const p of g2) console.log(`   ${p.first} ${p.last}`);
console.log(`\ntotal: ${g1.length + g2.length}`);

const existing = await sql`SELECT id, first_name, last_name FROM athletes WHERE age_category_id = ${CAT}`;
console.log(`already in the category: ${existing.length}`);
const u11 = await sql`SELECT age_category_id c, session_number sn, session_type FROM category_sessions WHERE age_category_id IN (140, 141) AND session_number = 1`;
console.log(`\nU11 F / U11 M session 1 type: ${u11.map(r => `${r.c}=${r.session_type}`).join(", ")} -> skills`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

const key = (f, l) => `${f.toLowerCase()}|${l.toLowerCase()}`;
const byName = new Map(existing.map(a => [key(a.first_name, a.last_name), a.id]));

for (const [groupNumber, people] of [[1, g1], [2, g2]]) {
  const [grp] = await sql`SELECT id FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1 AND group_number = ${groupNumber}`;
  if (!grp) { console.error(`no session group S1 G${groupNumber} -- run vmha-u13-tournament.mjs first`); process.exit(1); }
  let created = 0, placed = 0;
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    let id = byName.get(key(p.first, p.last));
    if (!id) {
      const [row] = await sql`
        INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, is_active)
        VALUES (${ORG}, ${CAT}, ${p.first}, ${p.last}, true) RETURNING id`;
      id = row.id; byName.set(key(p.first, p.last), id); created++;
    }
    // One group per athlete per session: clear any other session-1 placement
    // before asserting this one, so a re-run after a move does not leave them
    // skating in both groups.
    await sql`
      DELETE FROM player_group_assignments
      WHERE athlete_id = ${id} AND session_group_id IN (
        SELECT id FROM session_groups WHERE age_category_id = ${CAT} AND session_number = 1)`;
    await sql`
      INSERT INTO player_group_assignments (athlete_id, session_group_id, display_order)
      VALUES (${id}, ${grp.id}, ${i}) ON CONFLICT DO NOTHING`;
    placed++;
  }
  console.log(`Group ${groupNumber}: ${created} athletes created, ${placed} placed`);
}

for (const c of [140, 141]) {
  await sql`UPDATE category_sessions SET session_type = 'skills', name = 'Skills Skate' WHERE age_category_id = ${c} AND session_number = 1`;
}
console.log("U11 F and U11 M: session 1 -> skills skate");

const check = await sql`
  SELECT sg.group_number g, COUNT(*)::int n FROM player_group_assignments pga
  JOIN session_groups sg ON sg.id = pga.session_group_id
  WHERE sg.age_category_id = ${CAT} AND sg.session_number = 1 GROUP BY 1 ORDER BY 1`;
console.log(`\nfinal: ${check.map(r => `Group ${r.g} = ${r.n}`).join(", ")}`);
process.exit(0);
