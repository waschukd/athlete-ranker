import { NextResponse } from "next/server";
import { getSession, getAppUserId } from "@/lib/auth";
import { resolveEvaluatorKind } from "@/lib/categoryEvaluators";

// The signed-in evaluator's kind for a category: 'goalie' | 'coach' | 'standard'.
// The scoring screen uses this to scope the roster — goalie evaluators only see
// goalies, skater evaluators only see skaters.
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = new URL(request.url).searchParams.get("cat");
    if (!catId) return NextResponse.json({ kind: "standard" });
    const userId = await getAppUserId(session);
    const kind = await resolveEvaluatorKind(catId, userId, session.email);
    return NextResponse.json({ kind });
  } catch (e) {
    console.error("evaluator kind error:", e);
    return NextResponse.json({ kind: "standard" });
  }
}
