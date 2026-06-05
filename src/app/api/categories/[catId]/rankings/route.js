import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import { computeCategoryRankings } from "@/lib/rankings";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const scope = new URL(request.url).searchParams.get("scope") === "coach" ? "coach" : "official";
    return NextResponse.json(await computeCategoryRankings(catId, { scope }));
  } catch (error) {
    console.error("Rankings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
