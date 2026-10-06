import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { FEEDBACK_SURVEYS } from "@/lib/feedbackSurveys";

// Results for the season feedback surveys. Only Competitive Thread's own
// admins can read these -- association admins never see each other's answers.
const ALLOWED = new Set(["super_admin", "service_provider_admin"]);

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await sql`
    SELECT fr.id, fr.audience, fr.email, fr.answers, fr.comments, fr.sent_at, fr.submitted_at,
      u.name AS respondent_name, o.name AS org_name
    FROM feedback_responses fr
    LEFT JOIN users u ON u.id = fr.user_id
    LEFT JOIN organizations o ON o.id = fr.organization_id
    ORDER BY fr.submitted_at DESC NULLS LAST, fr.sent_at DESC NULLS LAST
  `;

  const summary = {};
  for (const r of rows) {
    summary[r.audience] ??= { invited: 0, submitted: 0 };
    summary[r.audience].invited++;
    if (r.submitted_at) summary[r.audience].submitted++;
  }

  const surveys = Object.fromEntries(Object.entries(FEEDBACK_SURVEYS).map(([aud, s]) => [aud, {
    title: s.title,
    questions: s.questions.map(q => ({ key: q.key, text: q.text })),
  }]));

  return NextResponse.json({ summary, surveys, responses: rows });
}
