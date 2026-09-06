import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { notifyTestingResultsUploaded } from "@/lib/scheduleNotify";
import { levenshtein } from "@/lib/voiceMatch";

// A spelling error in the uploaded sheet should still land on the existing
// roster entry, not create a duplicate. Last name must be a near-exact typo
// (distance <=1 -- different last names are different people, not spelling
// errors); first name gets more slack (distance <=2) to catch things like
// "Micheal"/"Michael" or "Jonh"/"John". Only matches if exactly ONE athlete
// clears both bars -- an ambiguous tie is safer left to fall through to
// auto-create than guessing wrong and merging two different kids.
function findFuzzyMatch(firstName, lastName, athletes) {
  const candidates = athletes.filter(a =>
    levenshtein(a.last_name.toLowerCase(), lastName) <= 1 &&
    levenshtein(a.first_name.toLowerCase(), firstName) <= 2
  );
  return candidates.length === 1 ? candidates[0] : null;
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { session_number, results } = body;
    // results = [{ first_name, last_name, overall_rank, tests?: [{ name, value, rank }] }]
    // `tests` is the full SportTesting per-test breakdown (kept for reporting);
    // overall_rank alone is what rankings use.

    const athletes = await sql`
      SELECT id, first_name, last_name FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true
    `;

    // Only needed if a row's name matches nobody on the roster -- most uploads
    // never touch this.
    let orgId = null;

    const matched = [];
    const skipped = [];
    const created = [];
    const fuzzyMatched = [];

    for (const row of results) {
      const firstName = row.first_name?.trim().toLowerCase();
      const lastName = row.last_name?.trim().toLowerCase();
      const rank = parseInt(row.overall_rank || row.overall_ranking);
      const tests = Array.isArray(row.tests) ? row.tests : [];

      if (!firstName || !lastName || isNaN(rank)) { skipped.push(row); continue; }

      // Match by first + last name (case insensitive)
      const athlete = athletes.find(a =>
        a.first_name.toLowerCase() === firstName &&
        a.last_name.toLowerCase() === lastName
      );

      if (!athlete) {
        // Same last name, and one first name is a prefix of the other -- "Meg"
        // for "Meghan", "Alex" for "Alexander".
        //
        // This used to accept a shared first INITIAL, which is not a nickname,
        // it is a coincidence. EFHA U11 has a Michelle Xu on the roster and a
        // Meghan Xu who tested but was never added: Meghan matched Michelle on
        // "same last name, both start with M" and overwrote her times. Two
        // sisters would do the same thing. Requiring a prefix means Meghan
        // falls through to auto-create, which is what should happen to someone
        // who is genuinely not on the roster.
        //
        // Ambiguity is left unmatched on purpose -- two roster entries that
        // both look right is not a match, it is a guess.
        const sameLast = athletes.filter(a => a.last_name.toLowerCase() === lastName);
        const nicknames = sameLast.filter(a => {
          const rosterFirst = a.first_name.toLowerCase();
          return rosterFirst.startsWith(firstName) || firstName.startsWith(rosterFirst);
        });
        const partial = nicknames.length === 1 ? nicknames[0] : null;
        if (partial) {
          matched.push({ athlete_id: partial.id, name: `${partial.first_name} ${partial.last_name}`, rank, tests });
          continue;
        }

        // A spelling error in the sheet ("Jonh Smith") should land on the
        // existing "John Smith", not create a duplicate.
        const fuzzy = findFuzzyMatch(firstName, lastName, athletes);
        if (fuzzy) {
          matched.push({ athlete_id: fuzzy.id, name: `${fuzzy.first_name} ${fuzzy.last_name}`, rank, tests });
          fuzzyMatched.push({ uploaded: `${row.first_name.trim()} ${row.last_name.trim()}`, matched: `${fuzzy.first_name} ${fuzzy.last_name}` });
          continue;
        }

        // Real incident: a tester's results file included a kid who'd genuinely
        // tested but was never in the roster -- getting silently skipped meant
        // their results just vanished with no record they'd shown up at all.
        // Rather than lose that, register them fresh (organization admins can
        // fix up position/birth year/etc. afterward same as any other athlete).
        if (!orgId) {
          const [cat] = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
          orgId = cat?.organization_id;
        }
        const rawFirst = row.first_name.trim();
        const rawLast = row.last_name.trim();
        const [newAthlete] = await sql`
          INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, is_active, notes)
          VALUES (${orgId}, ${catId}, ${rawFirst}, ${rawLast}, true, 'Added automatically from a testing results upload -- verify roster details (birth year, parent email, position).')
          RETURNING id, first_name, last_name
        `;
        athletes.push(newAthlete); // so a later duplicate row in the same file matches instead of creating twice
        created.push({ athlete_id: newAthlete.id, name: `${newAthlete.first_name} ${newAthlete.last_name}` });
        matched.push({ athlete_id: newAthlete.id, name: `${newAthlete.first_name} ${newAthlete.last_name}`, rank, tests });
        continue;
      }

      matched.push({ athlete_id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}`, rank, tests });
    }

    // ONE statement per table, not one per row.
    //
    // This previously fired a separate INSERT for every value -- a 125-athlete
    // file is 1,250 of them -- through Promise.all, and wrapped the whole thing
    // in a catch that only console.log'd. When the batch died partway the route
    // still returned success, so ranks were complete, most values were there,
    // and the last stretch of the alphabet silently had none. EFHA U11 and U13
    // each stopped at exactly 1,001 values that way, which nobody could see
    // until a parent report came back full of dashes.
    //
    // Sending arrays and expanding them with unnest() makes each table a single
    // round trip that either lands completely or throws. There is no partial
    // state to be silent about.

    // De-duplicate on the conflict key first: Postgres rejects an ON CONFLICT
    // statement that touches the same row twice ("cannot affect row a second
    // time"), and a roster with a repeated name or a sheet with two identically
    // titled columns would otherwise take the whole upload down. Last wins.
    // catId arrives as a route-param string and session_number straight off the
    // JSON body; unnest() casts the whole array at once, so one non-numeric
    // element would fail the entire statement rather than a single row.
    const CAT = Number(catId);
    const SESS = Number(session_number);
    const rankByAthlete = new Map();
    for (const m of matched) rankByAthlete.set(m.athlete_id, m.rank);
    const rIds = [...rankByAthlete.keys()];
    if (rIds.length) {
      await sql`
        INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank)
        SELECT * FROM unnest(
          ${rIds}::int[],
          ${rIds.map(() => CAT)}::int[],
          ${rIds.map(() => SESS)}::int[],
          ${rIds.map(id => rankByAthlete.get(id))}::int[])
        ON CONFLICT (athlete_id, age_category_id, session_number)
        DO UPDATE SET overall_rank = EXCLUDED.overall_rank, updated_at = NOW()`;
    }

    // Individual test values (used by the parent report). Still tolerant of the
    // table being absent on an older database, but no longer tolerant of a
    // partial write: anything that goes wrong is reported to the caller.
    let testsStored = 0;
    let testError = null;
    const byKey = new Map();
    for (const m of matched) {
      // Index in the array = column position in the uploaded CSV, left to right
      // -- stored so the viewer shows drills in the order they were actually
      // run rather than alphabetically.
      (m.tests || []).forEach((t, order) => {
        const name = (t.name || "").trim();
        const value = parseFloat(t.value);
        if (!name || isNaN(value)) return;
        const trank = parseInt(t.rank);
        byKey.set(`${m.athlete_id}|${name.toLowerCase()}`,
          { athlete_id: m.athlete_id, name, value, rank: isNaN(trank) ? null : trank, order });
      });
    }
    const vals = [...byKey.values()];
    if (vals.length) {
      try {
        await sql`
          INSERT INTO testing_results (athlete_id, age_category_id, session_number, test_name, value, test_rank, test_order)
          SELECT * FROM unnest(
            ${vals.map(v => v.athlete_id)}::int[],
            ${vals.map(() => CAT)}::int[],
            ${vals.map(() => SESS)}::int[],
            ${vals.map(v => v.name)}::text[],
            ${vals.map(v => v.value)}::numeric[],
            ${vals.map(v => v.rank)}::int[],
            ${vals.map(v => v.order)}::int[])
          ON CONFLICT (athlete_id, age_category_id, session_number, test_name)
          DO UPDATE SET value = EXCLUDED.value, test_rank = EXCLUDED.test_rank,
                        test_order = EXCLUDED.test_order, updated_at = NOW()`;
        testsStored = vals.length;
      } catch (e) {
        // Never silent again. A partial or failed write that reports success is
        // worse than an error, because the table looks populated.
        testError = e?.message || "test values failed to save";
        console.error("testing_results upsert failed:", e?.message);
      }
    }
    try {
      await notifyTestingResultsUploaded({ catId, sessionNumber: session_number, matchedCount: matched.length });
    } catch (e) { console.error("notifyTestingResultsUploaded failed:", e?.message); }

    return NextResponse.json({
      success: true,
      matched: matched.length,
      created: created.length,
      fuzzy_matched: fuzzyMatched.length,
      skipped: skipped.length,
      tests_stored: testsStored,
      tests_expected: vals.length,
      // Non-null when some or all test values failed to save. The upload can
      // still have stored ranks, which is exactly the state that looks fine.
      tests_error: testError,
      created_names: created.map(c => c.name),
      fuzzy_matched_names: fuzzyMatched.map(f => `"${f.uploaded}" → ${f.matched}`),
      skipped_names: skipped.map(s => `${s.first_name} ${s.last_name}${s.reason ? ` (${s.reason})` : ""}`),
    });
  } catch (error) {
    console.error("Testing upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
