
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { sendEmail } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { emails, sessionNum, entries, categoryName } = await request.json();
    if (!emails?.length) return NextResponse.json({ error: "No emails provided" }, { status: 400 });

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const groupLines = entries.map(e => {
      const time = e.start_time && e.end_time ? e.start_time + " - " + e.end_time : e.start_time || "";
      const checkinUrl = e.checkin_code ? BASE_URL + "/checkin/" + e.id : null;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500;">Group ${e.group_number || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">${e.scheduled_date?.toString().split("T")[0] || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">${time || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#555;">${e.location || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${e.checkin_code ? '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px;">' + e.checkin_code + '</code>' : "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${checkinUrl ? '<a href="' + checkinUrl + '" style="color:#1A6BFF;font-size:13px;">Open Check-in</a>' : "-"}</td>
        </tr>
      `;
    }).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#080E1A;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:0.1em;">SIDELINE STAR</div>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <h2 style="margin:0 0 8px;font-size:18px;color:#111;">You've been assigned as a volunteer</h2>
          <p style="color:#555;font-size:14px;margin:0 0 24px;">You're assigned to check-in duty for <strong>${categoryName}</strong> — Session ${sessionNum}. Use the links below to access check-in for your group.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Group</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Date</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Time</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Location</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Code</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Link</th>
              </tr>
            </thead>
            <tbody>${groupLines}</tbody>
          </table>
          <p style="color:#999;font-size:12px;margin:24px 0 0;">No account needed — just click the check-in link for your group when you arrive.</p>
        </div>
      </div>
    `;

    let sent = 0;
    for (const email of emails) {
      await sendEmail(email.trim(), "Volunteer assignment - " + categoryName + " Session " + sessionNum, html);
      sent++;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("Volunteer notify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
