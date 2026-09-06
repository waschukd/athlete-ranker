import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { computeEvaluatorReportCard } from "@/lib/evaluatorScorecard";

// Self-service version of the SP-facing scorecard (service-provider/evaluator/[evalId])
// -- surfaces the same real tier-consensus agreement rate + bias directly to the
// evaluator on their own dashboard, instead of them only finding out by email or
// being told in person.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    if (!user) return NextResponse.json({ applicable: false });

    const card = await computeEvaluatorReportCard(user.id);
    if (card.judged === 0) return NextResponse.json({ applicable: false });

    return NextResponse.json({
      applicable: true,
      agreement_pct: card.agreementPct,
      judged: card.judged,
      bias: card.bias,
    });
  } catch (error) {
    console.error("Evaluator report-card error:", error);
    return NextResponse.json({ applicable: false });
  }
}
