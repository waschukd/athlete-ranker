import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail, groupAssignmentHtml, parentEmails } from "@/lib/email";
import { generateICS } from "@/lib/calendar";

// Per-recipient delivery log for group-assignment emails. Auto-creates so no
// manual migration is needed. Webhook (/api/webhooks/resend) updates status by
// resend_id to delivered / bounced / complained.
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS group_email_log (
      id SERIAL PRIMARY KEY,
      age_category_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      group_number INTEGER,
      athlete_id INTEGER,
      athlete_name TEXT,
      recipient_email TEXT NOT NULL,
      resend_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_resend_idx ON group_email_log (resend_id)`;
  await sql`CREATE INDEX IF NOT EXISTS group_email_log_cat_sess_idx ON group_email_log (age_category_id, session_number)`;
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
function fmtDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [y, mo, da] = str.split("-").map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Gather everything needed to send (and preview) the group emails for a session.
async function buildPlan(catId, sessionNumber) {
  const catInfo = await sql`
    SELECT ac.name AS category_name, ac.organization_id, o.name AS org_name
    FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id
    WHERE ac.id = ${catId}
  `;
  if (!catInfo.length) return null;
  const sess = await sql`SELECT session_number, name, session_type FROM category_sessions WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}`;
  const groups = await sql`
    SELECT sg.id, sg.group_number,
      es.scheduled_date, es.start_time, es.end_time, es.location
    FROM session_groups sg
    LEFT JOIN evaluation_schedule es ON es.age_category_id = ${catId}
      AND es.session_number = sg.session_number AND es.group_number = sg.group_number
    WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNumber}
    ORDER BY sg.group_number
  `;
  const assigns = await sql`
    SELECT pga.athlete_id, pga.session_group_id, a.first_name, a.last_name, a.parent_email, a.parent_email_2
    FROM player_group_assignments pga
    JOIN session_groups sg ON sg.id = pga.session_group_id
    JOIN athletes a ON a.id = pga.athlete_id AND a.is_active = true
    WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNumber}
    ORDER BY a.last_name, a.first_name
  `;
  return { ...catInfo[0], session: sess[0] || { session_number: sessionNumber, name: `Session ${sessionNumber}`, session_type: null }, groups, assigns };
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const sessionNumber = parseInt(new URL(request.url).searchParams.get("session"));
    if (!sessionNumber) return NextResponse.json({ error: "session required" }, { status: 400 });

    const plan = await buildPlan(catId, sessionNumber);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const groups = plan.groups.map(g => {
      const members = plan.assigns.filter(a => a.session_group_id === g.id);
      return {
        group_number: g.group_number,
        date: fmtDate(g.scheduled_date),
        time: g.start_time ? `${fmtTime(g.start_time)}${g.end_time ? ` – ${fmtTime(g.end_time)}` : ""}` : "",
        location: g.location || "",
        scheduled: !!(g.scheduled_date && g.start_time),
        recipients: members.reduce((n, m) => n + parentEmails(m).length, 0),
        missing: members.filter(m => parentEmails(m).length === 0).map(m => `${m.first_name} ${m.last_name}`),
        total: members.length,
      };
    });

    // Latest send statuses (best-effort; table may not exist yet)
    let statuses = [];
    try {
      statuses = await sql`
        SELECT group_number, athlete_name, recipient_email, status, error, updated_at
        FROM group_email_log
        WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
        ORDER BY group_number, athlete_name
      `;
    } catch {}

    const counts = statuses.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return NextResponse.json({
      session: plan.session, category_name: plan.category_name, org_name: plan.org_name,
      groups, statuses, counts, last_sent_at: statuses[0]?.updated_at || null,
    });
  } catch (e) {
    console.error("group-emails GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { session_number } = await request.json();
    if (!session_number) return NextResponse.json({ error: "session_number required" }, { status: 400 });

    const plan = await buildPlan(catId, session_number);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await ensureTable();
    // Fresh batch for this session — clear prior log so the panel reflects this send.
    await sql`DELETE FROM group_email_log WHERE age_category_id = ${catId} AND session_number = ${session_number}`;

    const sessionLabel = `${plan.session.name || `Session ${session_number}`}${plan.session.session_type ? ` (${plan.session.session_type})` : ""}`;
    let sent = 0, failed = 0, skipped = 0;

    for (const g of plan.groups) {
      const members = plan.assigns.filter(a => a.session_group_id === g.id);
      const date = fmtDate(g.scheduled_date);
      const time = g.start_time ? `${fmtTime(g.start_time)}${g.end_time ? ` – ${fmtTime(g.end_time)}` : ""}` : "";
      for (const m of members) {
        const name = `${m.first_name} ${m.last_name}`;
        const emails = parentEmails(m);
        if (!emails.length) {
          skipped++;
          await sql`INSERT INTO group_email_log (age_category_id, session_number, group_number, athlete_id, athlete_name, recipient_email, status, error) VALUES (${catId}, ${session_number}, ${g.group_number}, ${m.athlete_id}, ${name}, ${""}, 'no_email', 'No parent email on file')`;
          continue;
        }
        const html = groupAssignmentHtml({
          playerName: name, categoryName: plan.category_name, orgName: plan.org_name,
          sessionLabel, groupNumber: g.group_number, date, time, location: g.location || "",
        });
        let attachments;
        if (g.scheduled_date && g.start_time) {
          const ics = generateICS({
            scheduled_date: g.scheduled_date, start_time: g.start_time, end_time: g.end_time,
            location: g.location, session_number, group_number: g.group_number,
            category_name: plan.category_name, org_name: plan.org_name, session_type: plan.session.session_type,
          });
          attachments = [{ filename: "session.ics", content: Buffer.from(ics).toString("base64") }];
        }
        // Email each household on file (separated parents); each is logged separately.
        for (const to of emails) {
          const res = await sendEmail(to, `${name} — Group ${g.group_number} · ${plan.category_name} (${plan.org_name})`, html, attachments);
          if (res.ok) sent++; else failed++;
          await sql`
            INSERT INTO group_email_log (age_category_id, session_number, group_number, athlete_id, athlete_name, recipient_email, resend_id, status, error)
            VALUES (${catId}, ${session_number}, ${g.group_number}, ${m.athlete_id}, ${name}, ${to}, ${res.id || null}, ${res.ok ? "sent" : "failed"}, ${res.ok ? null : (res.error || "send failed").slice(0, 500)})
          `;
        }
      }
    }

    return NextResponse.json({ success: true, sent, failed, skipped });
  } catch (e) {
    console.error("group-emails POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
