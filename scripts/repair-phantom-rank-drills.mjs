// Reattach ranks that were stored as their own fake "drill", then remove them.
//
//   node scripts/repair-phantom-rank-drills.mjs                  (dry run)
//   node scripts/repair-phantom-rank-drills.mjs --commit
//   node scripts/repair-phantom-rank-drills.mjs --cat 95 --commit
//
// A results sheet pairs each drill with a Rank column, so the header repeats
// "Rank" seven times. Excel renames the repeats to Rank.1, Rank.2 ... and the
// parser only skipped an exact "rank" -- so from the first renamed one onward,
// every rank was stored as a DRILL called "Rank.4" instead of as its drill's
// rank. In U13/U15/U18 only the first drill kept a rank at all.
//
// These rows are NOT junk to drop: they are the only copy of those ranks.
// Deleting them outright would lose them for good. Each one belongs to the
// drill immediately before it, so it is moved there and only then removed.
//
// Idempotent, and safe to run after a re-upload: a drill that already carries
// its own rank is left alone and the leftover row is just cleared away.
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ci = process.argv.indexOf("--cat");
const CAT = ci > -1 ? parseInt(process.argv[ci + 1]) : null;

// Anchored so a real drill that merely contains "rank" is never matched.
const rows = CAT
  ? await sql`SELECT * FROM testing_results WHERE age_category_id = ${CAT} ORDER BY athlete_id, session_number, test_order`
  : await sql`SELECT * FROM testing_results ORDER BY athlete_id, session_number, test_order`;
const isPhantom = (n) => /^rank(\.\d+)?$/i.test((n || "").trim());

// Group per athlete+session: test_order is only meaningful within one upload.
const groups = new Map();
for (const r of rows) {
  const k = `${r.athlete_id}|${r.age_category_id}|${r.session_number}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const moves = [];      // phantom rank -> the drill it belongs to
const orphans = [];    // phantom with no drill before it, or drill already ranked
const reorder = [];    // surviving drills, renumbered contiguously

for (const list of groups.values()) {
  list.sort((a, b) => a.test_order - b.test_order);
  const survivors = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!isPhantom(r.test_name)) { survivors.push(r); continue; }
    const drill = survivors[survivors.length - 1];
    if (drill && drill.test_rank == null && r.value != null) {
      moves.push({ drillId: drill.id, rank: Math.round(Number(r.value)), phantomId: r.id,
                   drillName: drill.test_name });
      drill.test_rank = Math.round(Number(r.value)); // so a re-run sees it as done
    } else {
      orphans.push({ phantomId: r.id, why: drill ? "drill already has its rank" : "no drill before it" });
    }
  }
  survivors.forEach((s, idx) => { if (s.test_order !== idx) reorder.push({ id: s.id, order: idx }); });
}

console.log(`ranks to reattach:      ${moves.length}`);
console.log(`phantoms merely dropped:${String(orphans.length).padStart(8)}`);
console.log(`drills renumbered:      ${reorder.length}`);
const sample = moves.slice(0, 3).map(m => `${m.drillName} <- rank ${m.rank}`);
if (sample.length) console.log("e.g. " + sample.join(", "));

if (!COMMIT) { console.log("\nDRY RUN — re-run with --commit."); process.exit(0); }

const doomed = [...moves.map(m => m.phantomId), ...orphans.map(o => o.phantomId)];
writeFileSync(new URL("../phantom-rank-backup.json", import.meta.url),
  JSON.stringify(rows.filter(r => doomed.includes(r.id)), null, 2));
console.log("backup: phantom-rank-backup.json");

// Reattach first. If anything fails here the phantoms are still present, so the
// ranks are never lost in between.
const B = 500;
for (let i = 0; i < moves.length; i += B) {
  const c = moves.slice(i, i + B);
  await sql`
    UPDATE testing_results r SET test_rank = m.rank, updated_at = NOW()
    FROM unnest(${c.map(x => x.drillId)}::int[], ${c.map(x => x.rank)}::int[]) AS m(id, rank)
    WHERE r.id = m.id`;
}
console.log(`reattached ${moves.length} ranks.`);

for (let i = 0; i < doomed.length; i += B) {
  await sql`DELETE FROM testing_results WHERE id = ANY(${doomed.slice(i, i + B)}::int[])`;
}
console.log(`removed ${doomed.length} phantom rows.`);

for (let i = 0; i < reorder.length; i += B) {
  const c = reorder.slice(i, i + B);
  await sql`
    UPDATE testing_results r SET test_order = m.ord
    FROM unnest(${c.map(x => x.id)}::int[], ${c.map(x => x.order)}::int[]) AS m(id, ord)
    WHERE r.id = m.id`;
}
console.log(`renumbered ${reorder.length} drills.`);
