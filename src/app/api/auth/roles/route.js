import { NextResponse } from "next/server";
import { getSession, getUserRoles } from "@/lib/auth";

// The roles the signed-in user can act as + which one is currently active.
// Drives the role switcher in the global session bar.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ active: null, roles: [] });
  const roles = await getUserRoles(session.email);
  // Always include the currently-active role (covers super_admin and any role
  // present on the token but not in a membership table).
  if (session.role && !roles.includes(session.role)) roles.unshift(session.role);
  return NextResponse.json({ active: session.role || null, roles });
}
