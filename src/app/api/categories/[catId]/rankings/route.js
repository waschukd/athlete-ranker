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

    return NextResponse.json(await computeCategoryRankings(catId));
  } catch (error) {
    console.error("Rankings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
