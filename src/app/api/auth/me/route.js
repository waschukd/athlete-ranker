import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Lightweight "who am I" for the global session bar. Returns null when not logged in.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { name: session.name || null, email: session.email || null, role: session.role || null } });
}
