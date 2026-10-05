import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { surveyFor } from "@/lib/feedbackSurveys";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";

// Public, token-only (no account). The token is the credential: a random
// UUID sent to one person. Responses never echo back anything but the survey
// itself, and a submitted token cannot be resubmitted.

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request, { params }) {
  if (!UUID.test(params.token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = await checkAndRecord({ endpoint: "feedback_view", identifier: clientIp(request), max: 60, windowMins: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const rows = await sql`SELECT audience, submitted_at FROM feedback_responses WHERE token = ${params.token}`;
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const survey = surveyFor(rows[0].audience);
  return NextResponse.json({ ...survey, submitted: !!rows[0].submitted_at });
}

export async function POST(request, { params }) {
  if (!UUID.test(params.token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = await checkAndRecord({ endpoint: "feedback_submit", identifier: clientIp(request), max: 20, windowMins: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const rows = await sql`SELECT id, audience, submitted_at FROM feedback_responses WHERE token = ${params.token}`;
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rows[0].submitted_at) return NextResponse.json({ error: "This survey has already been submitted. Thank you." }, { status: 409 });

  const survey = surveyFor(rows[0].audience);
  const body = await request.json().catch(() => ({}));
  const answers = {};
  for (const q of survey.questions) {
    const v = body.answers?.[q.key];
    if (typeof v === "string" && v.trim()) answers[q.key] = v.trim().slice(0, 2000);
  }
  const comments = typeof body.comments === "string" ? body.comments.trim().slice(0, 4000) : null;
  if (!Object.keys(answers).length && !comments) {
    return NextResponse.json({ error: "Please answer at least one question or leave a comment." }, { status: 400 });
  }

  await sql`
    UPDATE feedback_responses SET answers = ${JSON.stringify(answers)}, comments = ${comments || null}, submitted_at = NOW()
    WHERE id = ${rows[0].id} AND submitted_at IS NULL
  `;
  return NextResponse.json({ success: true });
}
