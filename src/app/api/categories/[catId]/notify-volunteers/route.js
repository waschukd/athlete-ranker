
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail, esc, sleep } from "@/lib/email";

// Assigning volunteers to check-in duty is a director/admin-level action --
// authorizeCategoryAccess alone also admits plain evaluators, which would
// otherwise turn this into a generic mail-relay reachable by any evaluator.
const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_RECIPIENTS = 200;

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    let { emails, sessionNum, entries, categoryName } = await request.json();
    if (!emails?.length) return NextResponse.json({ error: "No emails provided" }, { status: 400 });
    emails = [...new Set(emails.map(e => String(e || "").trim()).filter(e => EMAIL_RE.test(e)))].slice(0, MAX_RECIPIENTS);
    if (!emails.length) return NextResponse.json({ error: "No valid emails provided" }, { status: 400 });

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";

    // Stacked cards, not a multi-column table -- a 6-column table has no way to
    // fit a phone screen and most email clients ignore @media queries anyway
    // (Outlook in particular), so the safe cross-client pattern is to never
    // require horizontal space in the first place.
    //
    // The link points at the CODE-ENTRY page, not directly at /checkin/{id}:
    // /api/checkin/[scheduleId] only accepts a logged-in staff session OR a
    // checkin-token cookie minted by /api/checkin/entry after a code is
    // submitted (see that route's comment -- this is the fix for a real IDOR
    // hole, not incidental). A volunteer clicking straight into /checkin/{id}
    // with neither has no valid path in and the route correctly rejects them
    // -- previously surfacing as an infinite spinner then "Session not found."
    // Pre-filling the code via ?code= means they still only click one link,
    // then enter their name once, exactly like a walk-up volunteer would.
    const groupLines = entries.map(e => {
      const time = e.start_time && e.end_time ? e.start_time + " - " + e.end_time : e.start_time || "";
      const checkinUrl = e.checkin_code ? BASE_URL + "/checkin?code=" + encodeURIComponent(e.checkin_code) : null;
      return `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-weight:600;font-size:14px;color:#111;margin-bottom:4px;">Group ${e.group_number || "-"}</div>
          <div style="color:#555;font-size:13px;line-height:1.6;">
            ${e.scheduled_date?.toString().split("T")[0] || "-"}${time ? " · " + time : ""}<br/>
            ${esc(e.location) || "-"}
          </div>
          ${checkinUrl ? `<a href="${checkinUrl}" style="display:inline-block;margin-top:10px;padding:8px 16px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Check In →</a>` : ""}
          ${e.checkin_code ? `<div style="color:#999;font-size:11px;margin-top:8px;">Code: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${esc(e.checkin_code)}</code> (only needed if the button above doesn't work)</div>` : ""}
        </div>
      `;
    }).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <div style="background:#080E1A;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:0.1em;">SIDELINE STAR</div>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <h2 style="margin:0 0 8px;font-size:18px;color:#111;">You've been assigned as a volunteer</h2>
          <p style="color:#555;font-size:14px;margin:0 0 20px;">You're assigned to check-in duty for <strong>${esc(categoryName)}</strong> — Session ${esc(sessionNum)}. Tap Check In for your group below when you arrive.</p>
          ${groupLines}
          <p style="color:#999;font-size:12px;margin:20px 0 0;">No account needed — just enter your name when you get there.</p>
        </div>
      </div>
    `;

    let sent = 0;
    for (const email of emails) {
      await sendEmail(email.trim(), "Volunteer assignment - " + categoryName + " Session " + sessionNum, html);
      sent++;
      await sleep(110); // pace under Resend's 10 req/sec cap
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Volunteer notify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
