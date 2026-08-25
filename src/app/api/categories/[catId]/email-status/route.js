import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getEmailStatuses } from "@/lib/emailLog";

const TYPES = new Set(["welcome", "report"]);

// Per-recipient delivery status for a non-session-scoped email type (welcome,
// report). Session/group-assignment emails have their own richer view at
// /group-emails (grouped by session + group).
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const type = new URL(request.url).searchParams.get("type");
    if (!TYPES.has(type)) return NextResponse.json({ error: "type must be welcome or report" }, { status: 400 });

    const { statuses, counts } = await getEmailStatuses({ catId, emailType: type });
    return NextResponse.json({ statuses, counts });
  } catch (e) {
    console.error("email-status GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
