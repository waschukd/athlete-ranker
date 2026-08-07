import { NextResponse } from "next/server";
import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { checkAndRecord } from "@/lib/rateLimit";
import { generateCoachBriefing } from "@/lib/coachBriefing";

const GEN_ROLES = new Set([
  "super_admin", "association_admin", "director",
  "service_provider_admin", "goalie_service_provider_admin",
]);

// Generate (and cache) the AI coach's briefing for one team. Association/SP/
// director/super admin only; rate-limited to bound Anthropic spend.
export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { teamId } = await request.json();
    if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized || !GEN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const identifier = String((await getAppUserId(session)) || session.email || "anon");
    const { allowed } = await checkAndRecord({ endpoint: "coach_briefing_ai", identifier, max: 40, windowMins: 1440 });
    if (!allowed) return NextResponse.json({ error: "Daily briefing limit reached — try again tomorrow." }, { status: 429 });

    const result = await generateCoachBriefing(catId, teamId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, briefing: result.briefing });
  } catch (error) {
    console.error("Coach briefing route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
