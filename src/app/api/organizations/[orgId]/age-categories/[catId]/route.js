import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function DELETE(request, { params }) {
  try {
    await sql`DELETE FROM age_categories WHERE id = ${params.catId} AND organization_id = ${params.orgId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
