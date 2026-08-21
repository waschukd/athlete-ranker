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
