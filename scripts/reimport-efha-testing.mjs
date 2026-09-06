// Wipe and re-import testing results for the four EFHA Community divisions.
//
//   node scripts/reimport-efha-testing.mjs              (dry run)
//   node scripts/reimport-efha-testing.mjs --commit
//
// Mirrors the upload route exactly -- same header parsing, same match cascade
// (exact -> last name + first initial -> fuzzy -> auto-create), same bulk
// unnest() write -- so the outcome is identical to uploading through the UI.
// Used instead of the UI because these files REPLACE data that a since-fixed
// bug wrote badly: the old rows have to be deleted rather than upserted over,
// or a drill that is no longer in the sheet would linger forever.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const SESSION = 1;
const DL = "C:/Users/dan/Downloads/";

const JOBS = [
  { cat: 95, label: "U11 Community", file: DL + "U11_EFHA_overall_1.csv" },
  { cat: 97, label: "U13 Community", file: DL + "U13_EFHA_overall.csv" },
  { cat: 99, label: "U15 Community", file: DL + "U15_EFHA_overall.csv" },
  { cat: 101, label: "U18 Community", file: DL + "U18_EFHA_overall.csv" },
];

// The U13 sheet spells one drill "Left Tranisiton". Drill names are shown to
// parents verbatim and line up across divisions in reports, so a typo in one
// file reads as a different test entirely. Corrected here, and reported when
// it fires so the change is never silent.
const NAME_FIXES = { "left tranisiton": "Left Transition" };

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Same splitter the browser uses -- a quoted field may contain commas.
function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Excel renames a repeated "Rank" header to Rank.1, Rank.2 ... Matching only an
// exact "rank" is what previously uploaded those as though they were drills.
const isRankCol = (h) => /^rank(\.\d+)?$/.test(h || "");

function parse(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map(splitCsvLine);
  const header = rows[0];
  const lower = header.map(h => h.toLowerCase().trim());
  const firstIdx = lower.findIndex(h => h.includes("first"));
  const lastIdx = lower.findIndex(h => h.includes("last"));
  const overallIdx = lower.lastIndexOf("overall rank");
  const fixes = new Set();
  const testCols = [];
  for (let i = 0; i < header.length; i++) {
    const h = lower[i];
    if (!h || h.includes("first") || h.includes("last") || h === "position" || isRankCol(h) || h === "overall rank") continue;
    let name = header[i];
    if (NAME_FIXES[h]) { fixes.add(header[i] + " -> " + NAME_FIXES[h]); name = NAME_FIXES[h]; }
    testCols.push({ name, valueIdx: i, rankIdx: isRankCol(lower[i + 1]) ? i + 1 : -1 });
  }
  const results = rows.slice(1).map(cols => ({
    first_name: cols[firstIdx],
    last_name: cols[lastIdx],
    overall_rank: cols[overallIdx],
    tests: testCols
      .map(tc => ({ name: tc.name, value: cols[tc.valueIdx], rank: tc.rankIdx >= 0 ? cols[tc.rankIdx] : null }))
      .filter(t => t.value !== undefined && t.value !== ""),
  })).filter(r => r.first_name && r.last_name && r.overall_rank);
  return { results, drills: testCols.map(t => t.name), fixes: [...fixes] };
}

for (const job of JOBS) {
  const { results, drills, fixes } = parse(job.file);
  console.log("\n=== " + job.label + " (cat " + job.cat + ")");
  console.log("  file rows: " + results.length + "   drills: " + drills.join(", "));
  if (fixes.length) console.log("  drill name corrected: " + fixes.join(", "));

  const athletes = await sql`
    SELECT id, first_name, last_name FROM athletes
    WHERE age_category_id = ${job.cat} AND is_active = true`;
  const matched = [], created = [], fuzzyM = [], skipped = [];
  let orgId = null;

  for (const row of results) {
    const f = row.first_name?.trim().toLowerCase();
    const l = row.last_name?.trim().toLowerCase();
    const rank = parseInt(row.overall_rank);
    if (!f || !l || isNaN(rank)) { skipped.push(row.first_name + " " + row.last_name); continue; }

    let a = athletes.find(x => x.first_name.toLowerCase() === f && x.last_name.toLowerCase() === l);
    let how = "exact";
    if (!a) {
      // Same last name AND one first name a prefix of the other ("Meg"/"Meghan").
      // A shared initial alone is not a nickname: Meghan Xu matched Michelle Xu
      // that way and overwrote her times.
      const sameLast = athletes.filter(x => x.last_name.toLowerCase() === l);
      const nick = sameLast.filter(x => {
        const rf = x.first_name.toLowerCase();
        return rf.startsWith(f) || f.startsWith(rf);
      });
      if (nick.length === 1) { a = nick[0]; how = "nickname"; }
    }
    if (!a) {
      const c = athletes.filter(x =>
        levenshtein(x.last_name.toLowerCase(), l) <= 1 && levenshtein(x.first_name.toLowerCase(), f) <= 2);
      if (c.length === 1) { a = c[0]; how = "fuzzy"; fuzzyM.push(row.first_name + " " + row.last_name + " -> " + a.first_name + " " + a.last_name); }
    }
    if (!a) {
      if (!COMMIT) { created.push(row.first_name.trim() + " " + row.last_name.trim()); continue; }
      if (!orgId) {
        const [c] = await sql`SELECT organization_id FROM age_categories WHERE id = ${job.cat}`;
        orgId = c?.organization_id;
      }
      const note = "Added automatically from a testing results upload -- verify roster details (birth year, parent email, position).";
      const [na] = await sql`
        INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, is_active, notes)
        VALUES (${orgId}, ${job.cat}, ${row.first_name.trim()}, ${row.last_name.trim()}, true, ${note})
        RETURNING id, first_name, last_name`;
      athletes.push(na);
      a = na;
      created.push(na.first_name + " " + na.last_name);
      how = "created";
    }
    matched.push({ athlete_id: a.id, rank, tests: row.tests, uploaded: row.first_name + " " + row.last_name, how });
  }

  // Two file rows landing on ONE athlete is silent data loss: the second row
  // overwrites the first, so a real skater ends up with someone else's times.
  // The culprit is the route's last-name + first-INITIAL rule, which cannot
  // tell two siblings apart ("Ella Brown" and "Emma Brown" both match Brown, E).
  const seen = new Map();
  for (const m of matched) {
    if (!seen.has(m.athlete_id)) seen.set(m.athlete_id, []);
    seen.get(m.athlete_id).push(m);
  }
  const collisions = [...seen.entries()].filter(([, ms]) => ms.length > 1);
  for (const [id, ms] of collisions) {
    const who = athletes.find(x => x.id === id);
    console.log("  COLLISION: " + ms.map(m => m.uploaded + " (" + m.how + ")").join("  +  ") +
                "  all matched roster entry " + who.first_name + " " + who.last_name + " [id " + id + "]");
  }

  console.log("  matched " + matched.length + "   new athletes " + created.length +
              "   fuzzy " + fuzzyM.length + "   skipped " + skipped.length);
  fuzzyM.forEach(x => console.log("    fuzzy: " + x));
  created.forEach(x => console.log("    " + (COMMIT ? "created" : "would create") + ": " + x));
  skipped.forEach(x => console.log("    skipped: " + x));

  // De-duplicate on the conflict key: Postgres rejects an ON CONFLICT statement
  // that touches the same row twice, so a repeated name in the sheet would
  // otherwise fail the whole division.
  const rankByAthlete = new Map();
  for (const m of matched) rankByAthlete.set(m.athlete_id, m.rank);
  const byKey = new Map();
  for (const m of matched) {
    m.tests.forEach((t, order) => {
      const name = (t.name || "").trim();
      const value = parseFloat(t.value);
      if (!name || isNaN(value)) return;
      const tr = parseInt(t.rank);
      byKey.set(m.athlete_id + "|" + name.toLowerCase(),
        { athlete_id: m.athlete_id, name, value, rank: isNaN(tr) ? null : tr, order });
    });
  }
  const vals = [...byKey.values()];
  console.log("  values to write: " + vals.length +
              "  (" + matched.length + " athletes x " + drills.length + " drills = " + matched.length * drills.length + ")");

  if (collisions.length) {
    console.log("  REFUSING to write " + job.label + " until the collisions above are resolved.");
    continue;
  }

  if (!COMMIT) continue;

  const d1 = await sql`DELETE FROM testing_results WHERE age_category_id = ${job.cat} RETURNING id`;
  const d2 = await sql`DELETE FROM testing_drill_results WHERE age_category_id = ${job.cat} RETURNING athlete_id`;
  console.log("  cleared " + d1.length + " old values and " + d2.length + " old ranks");

  const rIds = [...rankByAthlete.keys()];
  await sql`
    INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank)
    SELECT * FROM unnest(
      ${rIds}::int[],
      ${rIds.map(() => job.cat)}::int[],
      ${rIds.map(() => SESSION)}::int[],
      ${rIds.map(i => rankByAthlete.get(i))}::int[])
    ON CONFLICT (athlete_id, age_category_id, session_number)
    DO UPDATE SET overall_rank = EXCLUDED.overall_rank, updated_at = NOW()`;

  await sql`
    INSERT INTO testing_results (athlete_id, age_category_id, session_number, test_name, value, test_rank, test_order)
    SELECT * FROM unnest(
      ${vals.map(v => v.athlete_id)}::int[],
      ${vals.map(() => job.cat)}::int[],
      ${vals.map(() => SESSION)}::int[],
      ${vals.map(v => v.name)}::text[],
      ${vals.map(v => v.value)}::numeric[],
      ${vals.map(v => v.rank)}::int[],
      ${vals.map(v => v.order)}::int[])
    ON CONFLICT (athlete_id, age_category_id, session_number, test_name)
    DO UPDATE SET value = EXCLUDED.value, test_rank = EXCLUDED.test_rank,
                  test_order = EXCLUDED.test_order, updated_at = NOW()`;

  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM testing_results WHERE age_category_id = ${job.cat}`;
  const [{ r }] = await sql`SELECT COUNT(*)::int AS r FROM testing_drill_results WHERE age_category_id = ${job.cat}`;
  console.log("  wrote " + n + " values and " + r + " ranks  " +
              (n === vals.length && r === rIds.length ? "OK" : "MISMATCH"));
}
console.log(COMMIT ? "\nDone." : "\nDRY RUN -- re-run with --commit.");
