import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import sql from "@/lib/db";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { schedule_id, email, session_info } = await request.json();
    if (!email || !schedule_id) return NextResponse.json({ error: "Email and session required" }, { status: 400 });

    const signupUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/evaluator/dashboard`;

    // Send via Resend if configured
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "noreply@athleteranker.com",
          to: email,
          subject: `${session.name || "An evaluator"} invited you to evaluate at ${session_info.org_name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="font-size: 22px; font-weight: 700; color: #111;">You're invited to evaluate!</h1>
              <p style="color: #555; font-size: 15px;">${session.name || "A fellow evaluator"} thinks you'd be a great fit for this session:</p>
              <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 8px; font-weight: 600; color: #111; font-size: 16px;">${session_info.org_name} · ${session_info.category_name}</p>
                <p style="margin: 0 0 4px; color: #555;">Session ${session_info.session_number}${session_info.group_number ? ` · Group ${session_info.group_number}` : ""}</p>
                <p style="margin: 0 0 4px; color: #555;">${session_info.scheduled_date?.toString().split("T")[0]}</p>
                <p style="margin: 0; color: #555;">${session_info.location || ""}</p>
              </div>
              <a href="${signupUrl}" style="display: inline-block; padding: 14px 28px; background: #1A6BFF; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">
                View & Sign Up →
              </a>
              <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Athlete Ranker · Hockey Evaluation Platform</p>
            </div>
          `,
        }),
      });
    }

    // Log the invite
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
      SELECT u.id, 'evaluator_invite_sent', 'evaluation_schedule', ${schedule_id}, ${email}
      FROM users u WHERE u.email = ${session.email}
    `;

    return NextResponse.json({
      success: true,
      message: process.env.RESEND_API_KEY
        ? `Invite sent to ${email}`
        : `Invite logged (configure RESEND_API_KEY to send emails). Share this link: ${signupUrl}`,
      signupUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
