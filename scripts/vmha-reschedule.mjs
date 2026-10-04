// VMHA (org 70) rebuilt their Oct 3 / Oct 4 ice schedule.
//
//   node scripts/vmha-reschedule.mjs            (preview)
//   node scripts/vmha-reschedule.mjs --commit
//
// The association's two schedule sheets, minus the power-skating ice, which
// is not in Competitive Thread's scope and must not become an evaluation
// session:
//
//   Oct 3  07:30 U11M Skills          -> U11 M  S1
//          08:45 U11F Skills          -> U11 F  S1
//          10:00 U13M Skills Group 1  -> U13 M  S1 G1
//          11:15 U13M Skills Group 2  -> U13 M  S1 G2
//          12:30 U11M Game 1          -> U11 M  S2
//          14:15 U11F Game 1          -> U11 F  S2
//          16:00 U13M Game 1          -> U13 M  S2
//          18:15 U11M Game 2          -> U11 M  S3
//   Oct 4  07:30 U13M Game 2          -> U13 M  S3
//          09:45 U11F Game 2          -> U11 F  S3
//          11:30 U13M Game 3          -> U13 M  S4
//
// Two shapes change, not just times: U13M gains a fourth session (it now runs
// three games, not two) and its skills slot splits into two groups, and U11M's
// last session moves from Sunday morning to Saturday evening. Five to six
// evaluators are already signed up per session, so every moved row sends the
// standard "session updated" notice -- cancelling and recreating would have
// silently dropped them from sessions they are rostered on.
//
// All ice is at the Stadium (the sheets' only venue column).
//
// service_provider_id stays NULL on these rows. It marks a schedule row as an
// SP's OWN testing event (a testing-only client with no association), and the
// SP dashboard lists those separately -- setting it on an association session
// made each new row appear twice, once real and once as "Testing".
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const NOTIFY = !process.argv.includes("--no-notify");
const FROM = process.env.EMAIL_FROM || "updates@sidelinestar.com";
const KEY = process.env.RESEND_API_KEY;

const ORG = 70, LOC = "Stadium";
const U11F = 140, U11M = 141, U13M = 142;

// The schedule as the association published it. One row per sheet line we keep.
const WANT = [
  { cat: U11M, sn: 1, g: 1, date: "2026-10-03", start: "07:30", end: "08:30", label: "U11M Skills" },
  { cat: U11F, sn: 1, g: 1, date: "2026-10-03", start: "08:45", end: "09:45", label: "U11F Skills" },
  { cat: U13M, sn: 1, g: 1, date: "2026-10-03", start: "10:00", end: "11:00", label: "U13M Skills Group 1" },
  { cat: U13M, sn: 1, g: 2, date: "2026-10-03", start: "11:15", end: "12:15", label: "U13M Skills Group 2" },
  { cat: U11M, sn: 2, g: 1, date: "2026-10-03", start: "12:30", end: "14:00", label: "U11M Game 1" },
  { cat: U11F, sn: 2, g: 1, date: "2026-10-03", start: "14:15", end: "15:45", label: "U11F Game 1" },
  { cat: U13M, sn: 2, g: 1, date: "2026-10-03", start: "16:00", end: "18:00", label: "U13M Game 1" },
  { cat: U11M, sn: 3, g: 1, date: "2026-10-03", start: "18:15", end: "19:45", label: "U11M Game 2" },
  { cat: U13M, sn: 3, g: 1, date: "2026-10-04", start: "07:30", end: "09:30", label: "U13M Game 2" },
  { cat: U11F, sn: 3, g: 1, date: "2026-10-04", start: "09:45", end: "11:15", label: "U11F Game 2" },
  { cat: U13M, sn: 4, g: 1, date: "2026-10-04", start: "11:30", end: "13:30", label: "U13M Game 3" },
];
const NAMES = { [U11F]: "U11 F", [U11M]: "U11 M", [U13M]: "U13 M" };
const DOW = (d) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(d + "T12:00:00").getDay()];
const hhmm = (t) => String(t).slice(0, 5);
const pretty = (d, s, e) => `${DOW(d)} ${d.slice(5)} ${hhmm(s)}-${hhmm(e)}`;

// Same alphabet and shape as generateCheckinCode in the app's schedule route.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function uniqueCheckinCode(sn, g) {
  for (;;) {
    let suffix = "";
    for (let i = 0; i < 6; i++) suffix += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
    const code = `S${sn}G${g}-${suffix}`;
    const dup = await sql`SELECT id FROM evaluation_schedule WHERE checkin_code = ${code}`;
    if (!dup.length) return code;
  }
}

const existing = await sql`
  SELECT id, age_category_id cat, session_number sn, group_number g, scheduled_date::text date, start_time, end_time, location
  FROM evaluation_schedule WHERE age_category_id IN (${U11F}, ${U11M}, ${U13M}) ORDER BY scheduled_date, start_time`;
const signups = await sql`
  SELECT schedule_id, COUNT(*)::int n FROM evaluator_session_signups
  WHERE schedule_id = ANY(${existing.map(r => r.id)}) AND status = 'signed_up' GROUP BY 1`;
const signupMap = new Map(signups.map(s => [s.schedule_id, s.n]));

// Match an existing row to its wanted slot by (category, session, group) so a
// row keeps its id, its check-in code and -- most importantly -- its sign-ups.
const key = (r) => `${r.cat}-${r.sn}-${r.g}`;
const byKey = new Map(existing.map(r => [key(r), r]));
const plan = [];
for (const w of WANT) {
  const cur = byKey.get(key(w));
  if (!cur) { plan.push({ ...w, action: "insert" }); continue; }
  const same = cur.date === w.date && hhmm(cur.start_time) === w.start && hhmm(cur.end_time) === w.end && cur.location === LOC;
  plan.push({ ...w, action: same ? "unchanged" : "update", id: cur.id, was: pretty(cur.date, cur.start_time, cur.end_time), signups: signupMap.get(cur.id) || 0 });
  byKey.delete(key(w));
}
const orphans = [...byKey.values()]; // rows the new sheet no longer has

console.log("VMHA -- Oct 3 / Oct 4 schedule\n");
for (const p of plan) {
  const line = `${NAMES[p.cat]} S${p.sn}${p.g > 1 ? ` G${p.g}` : ""}  ${pretty(p.date, p.start, p.end)}  ${p.label}`;
  if (p.action === "insert") console.log(`  NEW      ${line}`);
  else if (p.action === "update") console.log(`  MOVE     ${line}   (was ${p.was}, ${p.signups} evaluator${p.signups === 1 ? "" : "s"} signed up)`);
  else console.log(`  same     ${line}`);
}
if (orphans.length) {
  console.log("\n  rows no longer on the association's sheet:");
  for (const o of orphans) console.log(`    id ${o.id}  ${NAMES[o.cat]} S${o.sn} G${o.g}  ${pretty(o.date, o.start_time, o.end_time)}  (${signupMap.get(o.id) || 0} signed up)`);
}
console.log("\n  power skating (U15M, U18M, U11M, U11F, U13M G1/G2) deliberately NOT added -- outside scope.");
console.log(`  evaluators required: 4 per session (unchanged).`);

// U13M now runs four sessions, not three: add the row and reweight evenly.
const sessions = await sql`SELECT age_category_id cat, session_number sn, weight_percentage w FROM category_sessions WHERE age_category_id = ${U13M} ORDER BY session_number`;
const needsFourth = !sessions.some(s => s.sn === 4);
console.log(`\n  U13 M sessions: ${sessions.length} -> ${needsFourth ? 4 : sessions.length}${needsFourth ? "  (weights 33/33/34 -> 25/25/25/25)" : ""}`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

const moved = [];
for (const p of plan) {
  if (p.action === "unchanged") continue;
  if (p.action === "insert") {
    // A row with no checkin_code cannot be opened at the door AT ALL -- the
    // code is the only way in. The app's own schedule route always generates
    // one; this script did not, and VMHA U13 game 3 reached its start time
    // with no way to check anybody in.
    const code = await uniqueCheckinCode(p.sn, p.g);
    const [row] = await sql`
      INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, status, evaluators_required, service_provider_id, checkin_code, checkin_code_active)
      VALUES (${p.cat}, ${p.sn}, ${p.g}, ${p.date}, ${DOW(p.date)}, ${p.start}, ${p.end}, ${LOC}, 'scheduled', 4, NULL, ${code}, true)
      RETURNING id`;
    console.log(`inserted ${NAMES[p.cat]} S${p.sn} G${p.g} -> id ${row.id}, check-in code ${code}`);
  } else {
    await sql`
      UPDATE evaluation_schedule
      SET scheduled_date = ${p.date}, day_of_week = ${DOW(p.date)}, start_time = ${p.start}, end_time = ${p.end},
          location = ${LOC}, evaluators_required = 4, updated_at = NOW()
      WHERE id = ${p.id}`;
    console.log(`moved ${NAMES[p.cat]} S${p.sn} G${p.g} (id ${p.id}): ${p.was} -> ${pretty(p.date, p.start, p.end)}`);
    if (p.signups) moved.push(p);
  }
}

if (needsFourth) {
  await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, status, evaluators_required)
            VALUES (${U13M}, 4, 'Session 4', 'scrimmage', 25, 'scheduled', 4)
            ON CONFLICT DO NOTHING`;
  for (const sn of [1, 2, 3, 4]) await sql`UPDATE category_sessions SET weight_percentage = 25 WHERE age_category_id = ${U13M} AND session_number = ${sn}`;
  console.log("U13 M: session 4 added, all four sessions weighted 25%");
}

// ── Tell the evaluators who are already rostered on a moved session.
if (!NOTIFY || !moved.length) { console.log("\nno change emails sent."); process.exit(0); }
if (!KEY) { console.error("RESEND_API_KEY missing -- schedule updated but no emails sent."); process.exit(1); }
for (const p of moved) {
  const people = await sql`
    SELECT DISTINCT u.email, u.name FROM evaluator_session_signups ess JOIN users u ON u.id = ess.user_id
    WHERE ess.schedule_id = ${p.id} AND ess.status = 'signed_up'`;
  for (const person of people) {
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
      <h2 style="margin:0 0 4px;font-size:20px;color:#101113;">Session time changed</h2>
      <p style="margin:0 0 18px;font-size:14px;color:#5b606b;line-height:1.6;">Hi ${person.name || ""}, VMHA has rebuilt their tryout schedule. A session you are signed up for has moved.</p>
      <table style="width:100%;border-collapse:collapse;background:#f7f8fa;border-radius:10px;padding:8px;">
        <tr><td style="padding:6px 10px;font-size:13px;color:#5b606b;width:90px;">Session</td><td style="padding:6px 10px;font-size:13px;font-weight:600;color:#101113;">VMHA ${NAMES[p.cat]} — Session ${p.sn}${p.g > 1 ? ` Group ${p.g}` : ""}</td></tr>
        <tr><td style="padding:6px 10px;font-size:13px;color:#5b606b;">Was</td><td style="padding:6px 10px;font-size:13px;color:#8a8f98;text-decoration:line-through;">${p.was}</td></tr>
        <tr><td style="padding:6px 10px;font-size:13px;color:#5b606b;">Now</td><td style="padding:6px 10px;font-size:13px;font-weight:700;color:#0b5cd6;">${pretty(p.date, p.start, p.end)}</td></tr>
        <tr><td style="padding:6px 10px;font-size:13px;color:#5b606b;">Location</td><td style="padding:6px 10px;font-size:13px;font-weight:600;color:#101113;">Stadium</td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#5b606b;">You are still signed up. If the new time does not work, cancel from your dashboard so the spot can be filled.</p>
      <p style="margin:18px 0 0;"><a href="https://sidelinestar.com/evaluator/dashboard" style="display:inline-block;padding:12px 26px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:9px;font-size:14px;font-weight:600;">Open dashboard</a></p>
    </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: person.email, subject: `Session time changed — VMHA ${NAMES[p.cat]} Session ${p.sn}`, html }),
    });
    console.log(`${res.ok ? "sent" : "FAILED"} ${person.email}  ${NAMES[p.cat]} S${p.sn}`);
  }
}
console.log("\ndone.");
process.exit(0);
