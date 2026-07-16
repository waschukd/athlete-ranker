import sql from "@/lib/db";

// A scheduled slot carries its group number on evaluation_schedule, but "Manage
// groups" (and auto-assign) read the session_groups table. Both writers must
// create the row or the dashboard reports "No groups found. Upload a schedule
// first." while the Schedule tab happily shows the groups — which is exactly the
// bug that shipped when bulk-onboard grew its own schedule INSERT and didn't
// call this.
//
// Idempotent: safe to call per scheduled row.
export async function ensureSessionGroup(catId, sessionNumber, groupNumber) {
  if (!groupNumber) return;
  const existing = await sql`
    SELECT id FROM session_groups
    WHERE age_category_id = ${catId} AND session_number = ${sessionNumber} AND group_number = ${groupNumber}
  `;
  if (existing.length) return;
  await sql`
    INSERT INTO session_groups (age_category_id, session_number, group_number, name, display_order)
    VALUES (${catId}, ${sessionNumber}, ${groupNumber}, ${"Group " + groupNumber}, ${groupNumber})
  `;
}

// Backfill every group the schedule references but session_groups is missing.
// Returns the rows created. Used by the repair script and safe to re-run.
export async function backfillSessionGroups(catId = null) {
  const missing = catId
    ? await sql`
        SELECT DISTINCT es.age_category_id, es.session_number, es.group_number
        FROM evaluation_schedule es
        WHERE es.group_number IS NOT NULL AND es.age_category_id = ${catId}
          AND NOT EXISTS (
            SELECT 1 FROM session_groups sg
            WHERE sg.age_category_id = es.age_category_id
              AND sg.session_number = es.session_number
              AND sg.group_number = es.group_number)
        ORDER BY es.session_number, es.group_number`
    : await sql`
        SELECT DISTINCT es.age_category_id, es.session_number, es.group_number
        FROM evaluation_schedule es
        WHERE es.group_number IS NOT NULL AND es.age_category_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM session_groups sg
            WHERE sg.age_category_id = es.age_category_id
              AND sg.session_number = es.session_number
              AND sg.group_number = es.group_number)
        ORDER BY es.age_category_id, es.session_number, es.group_number`;

  for (const m of missing) {
    await ensureSessionGroup(m.age_category_id, m.session_number, m.group_number);
  }
  return missing;
}
