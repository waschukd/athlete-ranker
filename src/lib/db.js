import { neon, types } from "@neondatabase/serverless";

// DATE columns (OID 1082, e.g. evaluation_schedule.scheduled_date) are calendar
// days — no time, no zone. The driver's DEFAULT parser turns them into JS Date
// objects at local midnight, which then (a) stringify server-side to
// "Fri Aug 11 2026 …" with no "T" — breaking every `date.toString().split("T")[0]`
// and the group-email fmtDate into "Invalid Date" — and (b) shift by timezone
// when serialized. Keep DATE as the raw "YYYY-MM-DD" string so date-only values
// are stable everywhere and the server-side formatters that expect a string work.
// Timestamps (created_at, etc.) keep their default parsing — only 1082 changes.
types.setTypeParser(1082, (v) => v);

const sql = neon(process.env.DATABASE_URL);
export default sql;
